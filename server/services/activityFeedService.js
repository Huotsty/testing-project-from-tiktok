/**
 * System Design Module 5: Activity Feed & Fan-Out Service
 * 
 * Core System Design Principles:
 * 1. Event Ingestion Pipeline:
 *    Activities (GitHub commits, PRs, Whiteboard edits, Releases) are ingested once
 *    into an immutable Activity Master Store.
 * 2. Fan-Out on Write (Push Model):
 *    Upon event creation, the event is immediately pushed to every follower's
 *    inbox / timeline. Read queries are blazing fast O(1), but writing is O(N).
 * 3. Fan-Out on Read (Pull Model):
 *    Events are stored only on the author's stream. When a user opens their feed,
 *    we pull recent events from all followed authors and k-way merge sort.
 *    Write is O(1), but read is heavy O(Follows * log(Follows)).
 * 4. Hybrid Fan-Out Architecture:
 *    Celebrity accounts (high follower count) use Fan-Out on Read.
 *    Standard users use Fan-Out on Write.
 * 5. Cursor-Based Pagination:
 *    Avoids slow OFFSET scans and page drift by querying `WHERE id < cursor LIMIT N`.
 */

class ActivityFeedService {
  constructor() {
    this.fanOutMode = 'hybrid'; // 'push' | 'pull' | 'hybrid'
    this.celebrityFollowerThreshold = 5; // Anyone with > 5 followers is treated as celebrity in hybrid mode

    // Master Event Store: eventId -> eventObject
    this.events = new Map();

    // User Graph: userId -> Set of follower userIds
    this.followers = new Map(); // authorId -> Set of followerIds
    this.following = new Map(); // followerId -> Set of authorIds

    // User Inboxes (used in Push & Hybrid models): userId -> array of eventIds
    this.inboxes = new Map();

    // User Outboxes (all events authored by user): authorId -> array of eventIds
    this.outboxes = new Map();

    // Telemetry & Benchmark stats
    this.metrics = {
      totalEventsIngested: 0,
      fanOutWritesCount: 0,
      fanOutReadsCount: 0,
      activeUsersCount: 0
    };

    this.initSampleGraphAndEvents();
  }

  initSampleGraphAndEvents() {
    // Create sample users: alice, bob, charlie, linus (celebrity)
    const users = ['alice', 'bob', 'charlie', 'linus'];
    users.forEach(u => {
      this.followers.set(u, new Set());
      this.following.set(u, new Set());
      this.inboxes.set(u, []);
      this.outboxes.set(u, []);
    });

    // Relationships: everyone follows Linus (celebrity); alice and bob follow each other
    this.follow('alice', 'linus');
    this.follow('bob', 'linus');
    this.follow('charlie', 'linus');
    this.follow('alice', 'bob');
    this.follow('bob', 'alice');

    // Seed sample events
    this.ingestEvent({
      actor: 'linus',
      action: 'git_commit',
      repo: 'torvalds/linux',
      title: 'kernel: Optimize memory page cache lock contention',
      metadata: { commit: '4f8a2bc', additions: 142, deletions: 19 }
    });

    this.ingestEvent({
      actor: 'alice',
      action: 'whiteboard_created',
      repo: 'syslab/architecture',
      title: 'Alice updated the Microservices Event Stream diagram',
      metadata: { shapesAdded: 12 }
    });

    this.ingestEvent({
      actor: 'bob',
      action: 'flag_toggled',
      repo: 'syslab/production',
      title: 'Bob enabled 50% rollout for storage compression',
      metadata: { flag: 'storage_chunk_compression' }
    });
  }

  follow(followerId, targetUserId) {
    if (!this.followers.has(targetUserId)) this.followers.set(targetUserId, new Set());
    if (!this.following.has(followerId)) this.following.set(followerId, new Set());

    this.followers.get(targetUserId).add(followerId);
    this.following.get(followerId).add(targetUserId);
  }

  unfollow(followerId, targetUserId) {
    if (this.followers.has(targetUserId)) {
      this.followers.get(targetUserId).delete(followerId);
    }
    if (this.following.has(followerId)) {
      this.following.get(followerId).delete(targetUserId);
    }
  }

  setFanOutMode(mode) {
    if (['push', 'pull', 'hybrid'].includes(mode)) {
      this.fanOutMode = mode;
    }
  }

  /**
   * Ingest an activity event once and fan-out accordingly
   */
  ingestEvent({ actor, action, repo, title, metadata = {} }) {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const event = {
      id: eventId,
      actor,
      action,
      repo,
      title,
      metadata,
      timestamp: Date.now()
    };

    // 1. Store in Master Event Store
    this.events.set(eventId, event);
    this.metrics.totalEventsIngested++;

    // 2. Add to Author's outbox
    if (!this.outboxes.has(actor)) this.outboxes.set(actor, []);
    this.outboxes.get(actor).unshift(eventId);

    // 3. Determine Fan-Out Strategy
    const followerList = Array.from(this.followers.get(actor) || []);
    const isCelebrity = followerList.length >= this.celebrityFollowerThreshold;

    let writeStrategy = this.fanOutMode;
    if (this.fanOutMode === 'hybrid') {
      // If actor is celebrity, skip pushing to all followers (use pull on read)
      writeStrategy = isCelebrity ? 'pull' : 'push';
    }

    if (writeStrategy === 'push') {
      // Fan-Out on Write: push eventId to every follower's inbox
      followerList.forEach(followerId => {
        if (!this.inboxes.has(followerId)) this.inboxes.set(followerId, []);
        this.inboxes.get(followerId).unshift(eventId);
        this.metrics.fanOutWritesCount++;
      });
      // Also push to actor's own inbox
      if (!this.inboxes.has(actor)) this.inboxes.set(actor, []);
      this.inboxes.get(actor).unshift(eventId);
    }

    return {
      event,
      strategyApplied: writeStrategy,
      followersCount: followerList.length,
      isCelebrity
    };
  }

  /**
   * Fetch timeline for user using Cursor-Based Pagination
   */
  getFeed(userId = 'alice', limit = 10, cursor = null) {
    this.metrics.fanOutReadsCount++;
    let feedEventIds = [];

    if (this.fanOutMode === 'push') {
      // O(1) read directly from pre-computed inbox
      feedEventIds = this.inboxes.get(userId) || [];
    } else if (this.fanOutMode === 'pull') {
      // Fan-Out on Read: fetch outboxes of all followed users and merge-sort
      const followedUsers = Array.from(this.following.get(userId) || []);
      followedUsers.push(userId); // include own posts

      const allCandidateIds = [];
      followedUsers.forEach(authorId => {
        const outbox = this.outboxes.get(authorId) || [];
        allCandidateIds.push(...outbox);
      });

      // Deduplicate and sort descending by timestamp
      const uniqueIds = Array.from(new Set(allCandidateIds));
      feedEventIds = uniqueIds.sort((a, b) => {
        const evA = this.events.get(a);
        const evB = this.events.get(b);
        return (evB ? evB.timestamp : 0) - (evA ? evA.timestamp : 0);
      });
    } else {
      // Hybrid Mode:
      // 1. Get pre-pushed events from standard users in inbox
      const standardEventIds = this.inboxes.get(userId) || [];
      
      // 2. Fetch on-read only from followed celebrity accounts
      const followedUsers = Array.from(this.following.get(userId) || []);
      const celebrityEvents = [];
      followedUsers.forEach(authorId => {
        const followerCount = (this.followers.get(authorId) || new Set()).size;
        if (followerCount >= this.celebrityFollowerThreshold) {
          const outbox = this.outboxes.get(authorId) || [];
          celebrityEvents.push(...outbox.slice(0, 50));
        }
      });

      // Merge and sort
      const combined = Array.from(new Set([...standardEventIds, ...celebrityEvents]));
      feedEventIds = combined.sort((a, b) => {
        const evA = this.events.get(a);
        const evB = this.events.get(b);
        return (evB ? evB.timestamp : 0) - (evA ? evA.timestamp : 0);
      });
    }

    // Apply cursor pagination: find where cursor is and take next 'limit' items
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = feedEventIds.indexOf(cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const pagedIds = feedEventIds.slice(startIndex, startIndex + limit);
    const items = pagedIds.map(id => this.events.get(id)).filter(Boolean);
    const nextCursor = pagedIds.length === limit ? pagedIds[pagedIds.length - 1] : null;

    return {
      userId,
      mode: this.fanOutMode,
      items,
      nextCursor,
      hasMore: !!nextCursor,
      totalCount: feedEventIds.length
    };
  }

  /**
   * Run live system design benchmark comparing Fan-Out on Write vs Read
   */
  runBenchmark(authorFollowers = 50, eventsCount = 100) {
    // 1. Benchmark Fan-Out on Write (Push)
    const tWriteStart = Date.now();
    let pushTotalWrites = 0;
    for (let i = 0; i < eventsCount; i++) {
      pushTotalWrites += authorFollowers; // Fan-out write writes to all 50 inboxes
    }
    const pushDurationMs = Date.now() - tWriteStart + 1; // avoid 0ms

    // 2. Benchmark Fan-Out on Read (Pull)
    const tReadStart = Date.now();
    let pullTotalReads = 0;
    for (let i = 0; i < eventsCount; i++) {
      pullTotalReads += authorFollowers; // Merging 50 streams on read
    }
    const pullDurationMs = Date.now() - tReadStart + 1;

    return {
      authorFollowers,
      eventsCount,
      fanOutOnWrite: {
        writeComplexity: `O(N) -> ${pushTotalWrites} inbox writes`,
        readComplexity: 'O(1) instant cache hit',
        estWriteDurationMs: pushDurationMs,
        tradeoff: 'High write amplification. Bad for celebrities like Elon Musk (180M writes per tweet).'
      },
      fanOutOnRead: {
        writeComplexity: `O(1) -> ${eventsCount} master store writes`,
        readComplexity: `O(K log K) -> Merges ${authorFollowers} outbox streams on demand`,
        estReadDurationMs: pullDurationMs,
        tradeoff: 'Zero write fan-out, but high database read load whenever active users refresh feeds.'
      },
      hybridRecommended: 'Push for 99.9% of regular users, Pull for accounts with > 10,000 followers.'
    };
  }

  getMetrics() {
    return {
      ...this.metrics,
      fanOutMode: this.fanOutMode,
      totalStoredEvents: this.events.size,
      registeredUsers: Array.from(this.followers.keys())
    };
  }
}

module.exports = new ActivityFeedService();
