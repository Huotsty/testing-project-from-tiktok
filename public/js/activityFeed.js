/**
 * Client Module 5: Activity Feed & Fan-Out Service
 * Demonstrates Fan-out on Write vs Read, Hybrid Celebrity routing, and Cursor Pagination
 */

const ActivityFeedClient = {
  currentUser: 'alice',
  nextCursor: null,
  hasMore: false,

  init() {
    this.setupEventListeners();
    this.loadFeed(true);
    this.startMetricsPolling();
  },

  async loadFeed(reset = false) {
    const listEl = document.getElementById('feed-stream-container');
    if (!listEl) return;

    if (reset) {
      this.nextCursor = null;
    }

    let url = `/api/feed?user=${this.currentUser}&limit=8`;
    if (this.nextCursor) {
      url += `&cursor=${this.nextCursor}`;
    }

    try {
      const res = await fetch(url);
      const data = await res.json();

      this.nextCursor = data.nextCursor;
      this.hasMore = data.hasMore;

      const loadMoreBtn = document.getElementById('feed-load-more-btn');
      if (loadMoreBtn) {
        loadMoreBtn.style.display = this.hasMore ? 'inline-flex' : 'none';
      }

      const modeBadge = document.getElementById('feed-current-mode-badge');
      if (modeBadge) {
        modeBadge.textContent = `MODE: ${data.mode.toUpperCase()}`;
      }

      if (reset) {
        listEl.innerHTML = '';
      }

      if (!data.items || data.items.length === 0) {
        if (reset) {
          listEl.innerHTML = '<div style="color:var(--text-muted); padding:1.5rem; text-align:center;">No activity in timeline yet.</div>';
        }
        return;
      }

      data.items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'feed-item';

        const initials = item.actor.substring(0, 2).toUpperCase();
        const actionLabel = item.action.replace('_', ' ').toUpperCase();

        itemEl.innerHTML = `
          <div class="feed-avatar">${initials}</div>
          <div class="feed-body">
            <div class="feed-meta">
              <span class="feed-actor">${item.actor}</span>
              <span>•</span>
              <span class="system-tag" style="font-size:10px;">${actionLabel}</span>
              <span>•</span>
              <span>${new Date(item.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="feed-title">${item.title}</div>
            <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">
              Repo/Target: ${item.repo} | Event ID: ${item.id}
            </div>
          </div>
        `;
        listEl.appendChild(itemEl);
      });
    } catch (e) {
      console.error('Error loading feed:', e);
    }
  },

  async ingestCustomEvent() {
    const actor = document.getElementById('feed-event-actor').value || 'alice';
    const action = document.getElementById('feed-event-action').value;
    const repo = document.getElementById('feed-event-repo').value || 'syslab/repo';
    const title = document.getElementById('feed-event-title').value.trim();

    if (!title) return;

    await fetch('/api/feed/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor, action, repo, title })
    });

    document.getElementById('feed-event-title').value = '';
    this.loadFeed(true);
  },

  async runBenchmark() {
    const outEl = document.getElementById('feed-benchmark-output');
    if (outEl) {
      outEl.innerHTML = `<span style="color:var(--text-muted);">Running Fan-out simulation across 50 followers & 100 events...</span>`;
    }

    try {
      const res = await fetch('/api/feed/benchmark?followers=50&events=100');
      const data = await res.json();

      if (outEl) {
        outEl.innerHTML = `
          <div style="font-size:13px; font-weight:700; color:#fff; margin-bottom:8px;">
            Simulation: ${data.eventsCount} Events across ${data.authorFollowers} Followers
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px; font-family:var(--font-mono);">
            <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); padding:8px; border-radius:6px;">
              <strong style="color:var(--accent-primary);">Fan-Out on Write (Push)</strong><br>
              Write Cost: ${data.fanOutOnWrite.writeComplexity}<br>
              Read Latency: ${data.fanOutOnWrite.readComplexity}<br>
              Duration: ~${data.fanOutOnWrite.estWriteDurationMs} ms<br>
              <span style="color:var(--text-muted); font-size:10px;">${data.fanOutOnWrite.tradeoff}</span>
            </div>
            <div style="background:rgba(6,182,212,0.1); border:1px solid rgba(6,182,212,0.3); padding:8px; border-radius:6px;">
              <strong style="color:var(--accent-secondary);">Fan-Out on Read (Pull)</strong><br>
              Write Cost: ${data.fanOutOnRead.writeComplexity}<br>
              Read Latency: ${data.fanOutOnRead.readComplexity}<br>
              Duration: ~${data.fanOutOnRead.estReadDurationMs} ms<br>
              <span style="color:var(--text-muted); font-size:10px;">${data.fanOutOnRead.tradeoff}</span>
            </div>
          </div>
          <div style="margin-top:8px; font-size:11px; color:var(--accent-success); font-family:var(--font-mono);">
            💡 ${data.hybridRecommended}
          </div>
        `;
      }
    } catch (e) {
      if (outEl) outEl.textContent = 'Benchmark error: ' + e.message;
    }
  },

  setupEventListeners() {
    const userSelect = document.getElementById('feed-user-select');
    if (userSelect) {
      userSelect.addEventListener('change', (e) => {
        this.currentUser = e.target.value;
        this.loadFeed(true);
      });
    }

    const modeSelect = document.getElementById('feed-mode-select');
    if (modeSelect) {
      modeSelect.addEventListener('change', async (e) => {
        await fetch('/api/feed/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: e.target.value })
        });
        this.loadFeed(true);
      });
    }

    const loadMoreBtn = document.getElementById('feed-load-more-btn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => this.loadFeed(false));
    }

    const ingestForm = document.getElementById('feed-ingest-form');
    if (ingestForm) {
      ingestForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.ingestCustomEvent();
      });
    }

    const benchBtn = document.getElementById('feed-run-bench-btn');
    if (benchBtn) {
      benchBtn.addEventListener('click', () => this.runBenchmark());
    }
  },

  startMetricsPolling() {
    setInterval(async () => {
      try {
        const res = await fetch('/api/feed/metrics');
        const data = await res.json();
        
        const totalEventsEl = document.getElementById('feed-total-events');
        const fanoutWritesEl = document.getElementById('feed-fanout-writes');
        const fanoutReadsEl = document.getElementById('feed-fanout-reads');

        if (totalEventsEl) totalEventsEl.textContent = data.totalEventsIngested || 0;
        if (fanoutWritesEl) fanoutWritesEl.textContent = data.fanOutWritesCount || 0;
        if (fanoutReadsEl) fanoutReadsEl.textContent = data.fanOutReadsCount || 0;
      } catch (e) {
        // ignore
      }
    }, 2000);
  }
};
