# ⚡ SysLab ArchitectOS: Interactive System Design Workbench

An all-in-one interactive full-stack platform combining the **6 core distributed system design archetypes** into a single cohesive project, engineered for rapid hands-on learning, interviews, and real-world system architecture mastery.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the interactive workbench
npm start

# 3. Open in your browser
http://localhost:3000
```

---

## ⚡ The 80% Faster Learning Method

Most engineers spend 3–6 months passively reading books and watching videos. **SysLab cuts study time by 80%** using the **Active Simulation Loop**:
1. **See it Live**: Watch deltas, water buckets, and SSE streams update in real time.
2. **Break it Live**: Kill storage nodes, fire API bursts, and trigger duplicate network retries with built-in chaos switches.
3. **Trace the Code**: Every archetype is implemented in under 300 lines of clean, self-contained JavaScript with zero external frameworks.
4. **Teach it Back**: Use the 2-minute FAANG interview answer templates.

👉 **Read the full day-by-day plan:** [`LEARNING_ACCELERATOR.md`](file:///d:/testing%20the%20project/LEARNING_ACCELERATOR.md)

---

## 🏛️ The 6 Combined System Design Modules

| # | System Design Module | Core Architecture Principles | Key Tradeoffs & Gotchas | File Location |
|---|----------------------|------------------------------|-------------------------|---------------|
| **1** | **Collaborative Whiteboard** | **WebSockets delta-sync**, monotonic sequence numbering (`seq`), log compaction & snapshots, ephemeral cursor presence | Sending 80-byte mutation deltas saves **>98% bandwidth** vs full canvas snapshots; sequence counters detect packet drops. | [`server/services/whiteboardService.js`](file:///d:/testing%20the%20project/server/services/whiteboardService.js) |
| **2** | **Feature Flag Service** | **Low-latency in-memory reads (<0.1ms)**, **Server-Sent Events (SSE)** streaming cache invalidation, deterministic hash rollouts | Never make an HTTP round-trip on `isEnabled()`. Hash `(userId + key) % 100` for deterministic sticky rollouts without database lookups. | [`server/services/featureFlagService.js`](file:///d:/testing%20the%20project/server/services/featureFlagService.js) |
| **3** | **Social Post Scheduler** | **Delayed priority queue**, worker tick & atomic locking, **Idempotency Keys**, exponential backoff, Dead-Letter Queue (DLQ) | Storing an idempotency key guarantees that client network timeouts & retries never publish duplicate posts; DLQ isolates poison pills. | [`server/services/postSchedulerService.js`](file:///d:/testing%20the%20project/server/services/postSchedulerService.js) |
| **4** | **API Rate Limiter Gateway** | **Token Bucket** (bursts) & **Sliding Window Counter**, RFC headers (`X-RateLimit-*`, `Retry-After: 429`), OpenAI proxy | Token bucket handles burst traffic gracefully; sliding window eliminates edge-boundary 2x spikes. | [`server/services/rateLimiterService.js`](file:///d:/testing%20the%20project/server/services/rateLimiterService.js) |
| **5** | **Activity Feed & Fan-Out** | **Fan-Out on Write (Push)** vs **Fan-Out on Read (Pull)**, Hybrid celebrity routing, **Cursor-based pagination** | Push delivers $O(1)$ reads but suffers write amplification on celebrities. Hybrid uses push for standard users and pull for celebrities. | [`server/services/activityFeedService.js`](file:///d:/testing%20the%20project/server/services/activityFeedService.js) |
| **6** | **Distributed Object Storage (S3-Lite)** | **Metadata vs Chunk separation**, SHA-256 Content-Addressable Storage (CAS), **Replication Factor 2**, node failover | Chunks are distributed across Node A, B, and C. Taking Node A offline triggers transparent failover reads from replica nodes. | [`server/services/objectStorageService.js`](file:///d:/testing%20the%20project/server/services/objectStorageService.js) |

---

## ⚡ Unified End-to-End System Pipeline

Instead of testing each system in isolation, SysLab provides a **1-click end-to-end orchestration pipeline** that links all 6 systems together as a cohesive architecture:

1. **Rate Limiter Gateway**: Validates client tier and token bucket capacity.
2. **Feature Flag Engine**: Evaluates feature rollout rules in local memory (<0.05ms).
3. **Collaborative Whiteboard**: Issues an immutable state delta with monotonic sequence ordering over WebSockets.
4. **Distributed Object Storage (S3-Lite)**: Serializes the canvas, partitions it into SHA-256 chunks, and replicates across cluster nodes (RF=2).
5. **Delayed Job Scheduler**: Queues an announcement release with a unique **Idempotency Key** preventing double-posting.
6. **Activity Feed**: Fans out the release event to followers' inboxes using hybrid celebrity routing and cursor pagination.

---

## 🎓 Scale to 10M Users & FAANG Interview Drill (Tab 7)

- **Back-of-the-Envelope Scale Calculator**: Live interactive estimation of Write QPS, Peak QPS, Network Ingress, and Redis Cache RAM sizing for 10M–100M DAU.
- **Production Architecture Roadmap**: Direct mapping from SysLab's implementation to production technologies (Redis Pub/Sub, Kafka, Yjs CRDTs, Cloudflare Workers, Redlock, Cassandra, Reed-Solomon Erasure Coding).
- **FAANG Interview Drills**: Common interview traps and winning architectural answers for Figma, LaunchDarkly, Stripe, Cloudflare, Twitter/X, and AWS S3.

---

## 🧪 Interactive Chaos & Failure Simulations Built-in

The web interface includes dedicated interactive test benches for each system:
1. **Whiteboard**: Real-time multi-client canvas drawing with live delta byte counters.
2. **Feature Flags**: Live SSE stream log; in-memory evaluation benchmark tool (<0.05ms); instant toggle switches.
3. **Post Scheduler**: **"Simulate Duplicate Retries"** button (fires concurrent requests with the same idempotency key to test deduplication); chaos downstream failure rate slider.
4. **API Rate Limiter**: Animated Token Bucket water container; **"Fire Burst of 8 Requests"** button triggering HTTP 429 Too Many Requests; Free vs Pro tiers.
5. **Activity Feed**: Live timeline; **"Run 100x50 Benchmark"** comparing computational costs of Fan-out on write vs read; cursor pagination.
6. **Object Storage**: **"Simulate Crash"** toggle for Node A, Node B, and Node C; **"Read & Verify Failover"** inspector demonstrating automatic replica failover.
