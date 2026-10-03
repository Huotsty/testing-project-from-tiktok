/**
 * SysLab: The Unified System Design Interactive Lab & Workbench
 * 
 * Combines 6 core distributed system archetypes:
 * 1. Collaborative Whiteboard (WebSockets delta-sync)
 * 2. Feature Flag Service (In-memory evaluations & SSE streaming)
 * 3. Delayed Post Scheduler (Idempotency keys, worker ticking, DLQ)
 * 4. API Rate Limiter (Token Bucket & Sliding Window, OpenAI gateway)
 * 5. Activity Feed (Fan-out on Write vs Read, cursor pagination)
 * 6. S3-Lite Object Storage (Chunking, RF=2, node failover)
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

// Import the 6 system services
const whiteboardService = require('./services/whiteboardService');
const featureFlagService = require('./services/featureFlagService');
const postSchedulerService = require('./services/postSchedulerService');
const rateLimiterService = require('./services/rateLimiterService');
const activityFeedService = require('./services/activityFeedService');
const objectStorageService = require('./services/objectStorageService');
const flociService = require('./services/flociService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/whiteboard' });

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==========================================
// 1. COLLABORATIVE WHITEBOARD (WEBSOCKETS)
// ==========================================
wss.on('connection', (ws, req) => {
  const socketId = `ws-${Math.random().toString(36).substring(2, 9)}`;
  const user = whiteboardService.registerUser(socketId, {});

  // 1. Send initial snapshot to joining client
  const initialState = whiteboardService.getInitialState();
  ws.send(JSON.stringify(initialState));

  // 2. Broadcast presence update to others
  broadcastToOthers(ws, {
    type: 'user_joined',
    user,
    allUsers: whiteboardService.getAllUsers()
  });

  // Also ingest into Activity Feed!
  activityFeedService.ingestEvent({
    actor: user.name,
    action: 'whiteboard_joined',
    repo: 'syslab/canvas',
    title: `${user.name} joined the live whiteboard session`
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'delta') {
        // Process operation delta and broadcast to peers
        const processedDelta = whiteboardService.processDelta(socketId, data.delta);
        broadcastToOthers(ws, {
          type: 'delta',
          delta: processedDelta
        });
      } else if (data.type === 'cursor') {
        // Ephemeral cursor broadcast
        const cursorPayload = whiteboardService.updateCursor(socketId, data.x, data.y);
        if (cursorPayload) {
          broadcastToOthers(ws, cursorPayload);
        }
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err.message);
    }
  });

  ws.on('close', () => {
    whiteboardService.removeUser(socketId);
    broadcastToAll({
      type: 'user_left',
      socketId,
      allUsers: whiteboardService.getAllUsers()
    });
  });
});

function broadcastToOthers(senderWs, payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client !== senderWs && client.readyState === 1) {
      client.send(msg);
    }
  });
}

function broadcastToAll(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

app.get('/api/whiteboard/metrics', (req, res) => {
  res.json(whiteboardService.getMetrics());
});

app.post('/api/whiteboard/clear', (req, res) => {
  const cleared = whiteboardService.processDelta('api', { op: 'clear' });
  broadcastToAll({ type: 'delta', delta: cleared });
  res.json({ success: true });
});

// ==========================================
// 2. FEATURE FLAG SERVICE (SSE & LOCAL EVAL)
// ==========================================
app.get('/api/flags', (req, res) => {
  res.json({
    flags: featureFlagService.getAllFlags(),
    version: featureFlagService.version
  });
});

app.post('/api/flags', (req, res) => {
  const flag = featureFlagService.createFlag(req.body);
  activityFeedService.ingestEvent({
    actor: 'admin',
    action: 'flag_created',
    repo: 'syslab/flags',
    title: `Feature flag '${flag.key}' created with ${flag.rolloutPercentage}% rollout`
  });
  res.status(201).json(flag);
});

app.post('/api/flags/:key/toggle', (req, res) => {
  const updated = featureFlagService.toggleFlag(req.params.key);
  if (!updated) return res.status(404).json({ error: 'Flag not found' });
  activityFeedService.ingestEvent({
    actor: 'admin',
    action: 'flag_toggled',
    repo: 'syslab/flags',
    title: `Flag '${updated.key}' state changed to ${updated.enabled ? 'ENABLED' : 'DISABLED'}`
  });
  res.json(updated);
});

app.patch('/api/flags/:key', (req, res) => {
  const updated = featureFlagService.updateFlag(req.params.key, req.body);
  if (!updated) return res.status(404).json({ error: 'Flag not found' });
  res.json(updated);
});

app.get('/api/flags/evaluate', (req, res) => {
  const { key, userId } = req.query;
  const result = featureFlagService.evaluate(key, userId);
  res.json(result);
});

// SSE Streaming updates for client SDKs
app.get('/api/flags/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  featureFlagService.addSseClient(res);
});

app.get('/api/flags/metrics', (req, res) => {
  res.json(featureFlagService.getMetrics());
});

// ==========================================
// 3. SOCIAL POST SCHEDULER (IDEMPOTENCY & DLQ)
// ==========================================
app.get('/api/scheduler/jobs', (req, res) => {
  res.json({
    jobs: postSchedulerService.getAllJobs(),
    metrics: postSchedulerService.getMetrics()
  });
});

app.post('/api/scheduler/schedule', (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
  const result = postSchedulerService.schedulePost({
    content: req.body.content,
    platform: req.body.platform,
    scheduledAt: req.body.scheduledAt,
    idempotencyKey
  });

  if (!result.isDuplicate) {
    activityFeedService.ingestEvent({
      actor: 'creator',
      action: 'post_scheduled',
      repo: 'syslab/scheduler',
      title: `Scheduled social post for ${result.job.platform}: "${result.job.content.substring(0, 35)}..."`
    });
  }

  res.status(result.isDuplicate ? 200 : 201).json(result);
});

app.post('/api/scheduler/redrive/:jobId', (req, res) => {
  const job = postSchedulerService.redriveJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found or not in DLQ' });
  res.json({ success: true, job });
});

app.post('/api/scheduler/failure-rate', (req, res) => {
  const rate = Number(req.body.rate);
  postSchedulerService.setSimulatedFailureRate(rate);
  res.json({ success: true, rate });
});

// ==========================================
// 4. API RATE LIMITER (TOKEN BUCKET / SLIDING WINDOW)
// ==========================================
// Rate limiting middleware protecting OpenAI endpoint
const rateLimiterMiddleware = (req, res, next) => {
  const clientKey = req.headers['x-api-key'] || req.ip || 'client-default';
  const tier = req.headers['x-tier'] || 'free';
  const check = rateLimiterService.checkLimit(clientKey, tier);

  // Set RFC-compliant RateLimit response headers
  Object.entries(check.headers).forEach(([k, v]) => {
    res.setHeader(k, v);
  });

  if (!check.allowed) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit quota exceeded. Try again in ${check.retryAfter} seconds.`,
      rateCheck: check
    });
  }

  req.rateCheck = check;
  next();
};

app.post('/api/openai/mock-completion', rateLimiterMiddleware, (req, res) => {
  const prompt = req.body.prompt || 'Explain distributed transactions';
  const mockResponses = [
    `Distributed System Tip: Use Saga pattern instead of Two-Phase Commit (2PC) for high-scale microservices.`,
    `Database Scaling: Read replicas scale read volume; use CQRS or sharding for write-heavy workloads.`,
    `Cache Stampede Mitigation: Implement Probabilistic Early Expiration (XFetch) or mutex locks on cache misses.`,
    `Consistency: Tunable consistency (R + W > N) in Dynamo-style systems guarantees strong consistency.`
  ];
  const completion = mockResponses[Math.floor(Math.random() * mockResponses.length)];

  res.json({
    id: `chatcmpl-${Math.random().toString(36).substring(2, 9)}`,
    model: 'gpt-4o-mock',
    created: Date.now(),
    reply: completion,
    rateLimitRemaining: req.rateCheck.remaining
  });
});

app.get('/api/ratelimit/state', (req, res) => {
  const clientKey = req.query.clientKey || 'client-default';
  const tier = req.query.tier || 'free';
  res.json(rateLimiterService.getClientState(clientKey, tier));
});

app.post('/api/ratelimit/algorithm', (req, res) => {
  const algo = req.body.algorithm;
  rateLimiterService.setAlgorithm(algo);
  res.json({ success: true, algorithm: rateLimiterService.selectedAlgorithm });
});

app.get('/api/ratelimit/metrics', (req, res) => {
  res.json(rateLimiterService.getMetrics());
});

// ==========================================
// 5. ACTIVITY FEED SERVICE (FAN-OUT & PAGINATION)
// ==========================================
app.get('/api/feed', (req, res) => {
  const { user = 'alice', limit = 10, cursor = null } = req.query;
  const feed = activityFeedService.getFeed(user, Number(limit), cursor);
  res.json(feed);
});

app.post('/api/feed/ingest', (req, res) => {
  const result = activityFeedService.ingestEvent(req.body);
  res.status(201).json(result);
});

app.post('/api/feed/mode', (req, res) => {
  const mode = req.body.mode;
  activityFeedService.setFanOutMode(mode);
  res.json({ success: true, mode: activityFeedService.fanOutMode });
});

app.get('/api/feed/benchmark', (req, res) => {
  const followers = Number(req.query.followers || 50);
  const events = Number(req.query.events || 100);
  const benchmark = activityFeedService.runBenchmark(followers, events);
  res.json(benchmark);
});

app.get('/api/feed/metrics', (req, res) => {
  res.json(activityFeedService.getMetrics());
});

// ==========================================
// 6. OBJECT STORAGE SERVICE (S3-LITE CHUNKING & RF=2)
// ==========================================
app.get('/api/storage/cluster', (req, res) => {
  res.json(objectStorageService.getClusterStatus());
});

app.get('/api/storage/files', (req, res) => {
  res.json({ files: objectStorageService.getAllFiles() });
});

app.post('/api/storage/node/:node/toggle', (req, res) => {
  const { node } = req.params;
  const { online } = req.body;
  const result = objectStorageService.setNodeStatus(node, online);
  if (!result) return res.status(404).json({ error: 'Node not found' });
  
  activityFeedService.ingestEvent({
    actor: 'cluster-admin',
    action: 'node_status_changed',
    repo: 'syslab/s3-cluster',
    title: `Storage ${node.toUpperCase()} set to ${result.status}`
  });

  res.json(result);
});

app.post('/api/storage/upload-direct', (req, res) => {
  const { filename, content, mimeType = 'text/plain', chunkSize = 64 } = req.body;
  if (!filename || !content) {
    return res.status(400).json({ error: 'filename and content required' });
  }

  const buffer = Buffer.from(content, 'utf-8');
  const metadata = objectStorageService.storeFileDirect(filename, mimeType, buffer, Number(chunkSize));

  activityFeedService.ingestEvent({
    actor: 'alice',
    action: 'file_uploaded',
    repo: 'syslab/s3-cluster',
    title: `Stored file "${filename}" (${metadata.size} bytes across ${metadata.totalChunks} chunks)`
  });

  res.status(201).json(metadata);
});

app.get('/api/storage/file/:fileId', (req, res) => {
  try {
    const fileResult = objectStorageService.readFile(req.params.fileId);
    res.json({
      metadata: fileResult.metadata,
      contentPreview: fileResult.buffer.toString('utf-8').substring(0, 1000),
      readReport: fileResult.readReport
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// UNIFIED END-TO-END PIPELINE ORCHESTRATOR
// Chains all 6 distributed systems together!
// ==========================================
app.post('/api/system/run-unified-pipeline', (req, res) => {
  const steps = [];
  const pipelineStartTime = Date.now();
  const clientKey = req.body.clientKey || 'architect-vip';
  const tier = req.body.tier || 'pro';
  const idempotencyKey = req.body.idempotencyKey || `pipe-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Step 1: Rate Limiter Gateway Check
  const t0 = performance.now();
  const rateCheck = rateLimiterService.checkLimit(clientKey, tier);
  const rateDuration = (performance.now() - t0).toFixed(2);

  steps.push({
    stepNumber: 1,
    name: 'Rate Limiter Gateway',
    module: 'rateLimiterService',
    status: rateCheck.allowed ? 'PASSED' : 'BLOCKED',
    durationMs: rateDuration,
    details: `Algorithm: ${rateLimiterService.selectedAlgorithm}. Remaining quota: ${rateCheck.remaining}/${rateCheck.limit}`,
    headers: rateCheck.headers
  });

  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      pipelineHaltedAt: 'Step 1 (Rate Limiter)',
      steps,
      totalDurationMs: (Date.now() - pipelineStartTime)
    });
  }

  // Step 2: Feature Flag Local In-Memory Evaluation
  const t1 = performance.now();
  const flagEval = featureFlagService.evaluate('whiteboard_ai_assistant', clientKey);
  const flagDuration = (performance.now() - t1).toFixed(3);

  steps.push({
    stepNumber: 2,
    name: 'Feature Flag In-Memory Evaluation',
    module: 'featureFlagService',
    status: flagEval.enabled ? 'ACTIVE' : 'FLAG_OFF',
    durationMs: flagDuration,
    details: `Evaluated 'whiteboard_ai_assistant' in-memory (<0.05ms): ${flagEval.reason} (Bucket: ${flagEval.bucket ?? 'N/A'})`
  });

  // Step 3: Whiteboard Delta Event
  const t2 = performance.now();
  const newElement = {
    id: `arch-${Date.now()}`,
    type: 'sticky',
    x: Math.floor(Math.random() * 300 + 50),
    y: Math.floor(Math.random() * 200 + 50),
    width: 200,
    height: 120,
    color: '#8b5cf6',
    text: `🚀 Unified Pipeline v${whiteboardService.sequenceNumber + 1}\nStatus: Certified\nKey: ${idempotencyKey.substring(0, 10)}...`
  };
  const processedDelta = whiteboardService.processDelta('pipeline-runner', {
    op: 'create',
    element: newElement
  });
  // Broadcast delta to connected clients
  broadcastToAll({ type: 'delta', delta: processedDelta });
  const deltaDuration = (performance.now() - t2).toFixed(2);

  steps.push({
    stepNumber: 3,
    name: 'Collaborative Whiteboard Delta',
    module: 'whiteboardService',
    status: 'SYNCED',
    durationMs: deltaDuration,
    details: `Assigned Monotonic Seq #${processedDelta.seq}. Broadcasted ~${JSON.stringify(processedDelta).length} bytes delta via WebSockets.`
  });

  // Step 4: S3-Lite Chunked Storage & Hash Ring Replication
  const t3 = performance.now();
  const diagramPayload = JSON.stringify({
    architectureVersion: processedDelta.seq,
    elementsCount: whiteboardService.elements.size,
    exportedAt: new Date().toISOString(),
    elements: Array.from(whiteboardService.elements.values())
  });
  const storageMetadata = objectStorageService.storeFileDirect(
    `pipeline-snapshot-seq-${processedDelta.seq}.json`,
    'application/json',
    Buffer.from(diagramPayload, 'utf-8'),
    64 // 64-byte chunks for high-density chunking demonstration
  );
  const s3Duration = (performance.now() - t3).toFixed(2);

  steps.push({
    stepNumber: 4,
    name: 'Distributed Object Storage (S3-Lite)',
    module: 'objectStorageService',
    status: 'STORED & REPLICATED',
    durationMs: s3Duration,
    details: `Stored ${storageMetadata.size} bytes split into ${storageMetadata.totalChunks} SHA-256 chunks across cluster nodes (Replication Factor = 2). ETag: ${storageMetadata.etag.substring(0, 12)}...`
  });

  // Step 5: Delayed Post Scheduler with Idempotency Key
  const t4 = performance.now();
  const scheduledResult = postSchedulerService.schedulePost({
    content: `Architecture Snapshot #${processedDelta.seq} successfully certified and replicated across S3 storage cluster.`,
    platform: 'GitHub Discussions',
    scheduledAt: Date.now() + 10000, // 10 seconds in future
    idempotencyKey
  });
  const schedDuration = (performance.now() - t4).toFixed(2);

  steps.push({
    stepNumber: 5,
    name: 'Delayed Queue & Idempotency Check',
    module: 'postSchedulerService',
    status: scheduledResult.isDuplicate ? 'DEDUPLICATED' : 'QUEUED',
    durationMs: schedDuration,
    details: scheduledResult.isDuplicate 
      ? `Duplicate idempotencyKey '${idempotencyKey}' detected. Deduplicated safely!` 
      : `Job #${scheduledResult.job.id} queued for ${new Date(scheduledResult.job.scheduledAt).toLocaleTimeString()} with Idempotency Key.`
  });

  // Step 6: Activity Feed Event Fan-Out & Cursor Stream
  const t5 = performance.now();
  const feedResult = activityFeedService.ingestEvent({
    actor: 'architect-lead',
    action: 'pipeline_executed',
    repo: 'syslab/production-cluster',
    title: `Executed Unified Pipeline: Canvas #${processedDelta.seq} exported to S3 & scheduled for release`,
    metadata: {
      seq: processedDelta.seq,
      chunks: storageMetadata.totalChunks,
      jobId: scheduledResult.job.id
    }
  });
  const feedDuration = (performance.now() - t5).toFixed(2);

  steps.push({
    stepNumber: 6,
    name: 'Activity Feed Fan-Out & Cursors',
    module: 'activityFeedService',
    status: 'FAN_OUT_COMPLETE',
    durationMs: feedDuration,
    details: `Ingested Event #${feedResult.event.id}. Strategy: ${feedResult.strategyApplied.toUpperCase()} (Fanned out to ${feedResult.followersCount} follower inboxes).`
  });

  const totalDuration = (Date.now() - pipelineStartTime);

  res.json({
    success: true,
    totalDurationMs: totalDuration,
    pipelineId: idempotencyKey,
    steps,
    summary: 'All 6 distributed system primitives successfully executed in sequence as one unified product architecture!'
  });
});

app.get('/api/system/overview', async (req, res) => {
  const flociHealth = await flociService.getHealth();
  res.json({
    status: 'ONLINE',
    uptime: process.uptime(),
    modules: {
      whiteboard: whiteboardService.getMetrics(),
      featureFlags: featureFlagService.getMetrics(),
      postScheduler: postSchedulerService.getMetrics(),
      rateLimiter: rateLimiterService.getMetrics(),
      activityFeed: activityFeedService.getMetrics(),
      objectStorage: objectStorageService.getClusterStatus(),
      floci: flociHealth
    }
  });
});

// ==========================================
// 8. FLOCI LOCAL CLOUD INTEGRATION API
// ==========================================
app.get('/api/floci/status', async (req, res) => {
  const health = await flociService.getHealth();
  res.json(health);
});

app.get('/api/floci/s3/list', async (req, res) => {
  try {
    const buckets = await flociService.s3ListBuckets();
    const bucket = req.query.bucket || 'syslab-cloud-bucket';
    const objects = await flociService.s3ListObjects(bucket);
    res.json({ success: true, buckets, currentBucket: bucket, objects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/floci/s3/sync', async (req, res) => {
  try {
    const result = await flociService.syncFromSysLabStorage(objectStorageService, req.body.bucket || 'syslab-cloud-bucket');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/floci/s3/upload', async (req, res) => {
  try {
    const { bucket = 'syslab-cloud-bucket', filename, content } = req.body;
    const result = await flociService.s3PutObject(bucket, `uploads/${filename || 'note.txt'}`, content || 'Sample text content');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/floci/sqs/list', async (req, res) => {
  try {
    const queues = await flociService.sqsListQueues();
    res.json({ success: true, queues });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/floci/sqs/bridge', async (req, res) => {
  try {
    const result = await flociService.bridgePostScheduler(postSchedulerService, req.body.queueName || 'syslab-posts-queue');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/floci/sqs/send', async (req, res) => {
  try {
    const { queueUrl, message } = req.body;
    const result = await flociService.sqsSendMessage(queueUrl, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/floci/sqs/receive', async (req, res) => {
  try {
    const { queueUrl } = req.query;
    if (!queueUrl) return res.status(400).json({ success: false, error: 'queueUrl is required' });
    const messages = await flociService.sqsReceiveMessages(queueUrl);
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/floci/dynamodb/sync', async (req, res) => {
  try {
    const result = await flociService.syncFeatureFlags(featureFlagService, req.body.tableName || 'SysLabFlags');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/floci/dynamodb/scan', async (req, res) => {
  try {
    const items = await flociService.dynamoScan(req.query.tableName || 'SysLabFlags');
    res.json({ success: true, tableName: req.query.tableName || 'SysLabFlags', items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cloud Liveness & Readiness Probes (Kubernetes / AWS ECS / Render / Cloud Run)
app.get(['/healthz', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    },
    environment: process.env.NODE_ENV || 'production'
  });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SysLab Cloud-Ready Workbench running on:`);
  console.log(`   Local / Container: http://${HOST}:${PORT}`);
  console.log(`   Health Check Probe: http://${HOST}:${PORT}/healthz`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=======================================================`);
});

// Graceful Shutdown for Cloud Orchestrators (Docker / Kubernetes SIGTERM & SIGINT)
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Stop background scheduler tick
  postSchedulerService.stopWorker();

  // Close active WebSockets
  wss.clients.forEach(client => {
    client.close(1001, 'Server shutting down');
  });

  server.close(() => {
    console.log('✅ HTTP and WebSocket server closed cleanly.');
    process.exit(0);
  });

  // Force shutdown after 10s if connections linger
  setTimeout(() => {
    console.error('⚠️ Forcefully terminating process after 10s timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
