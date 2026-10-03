/**
 * SysLab Dynamic Configuration Manager
 * 
 * Centralizes all system environment variables with dynamic runtime mutation.
 * Emits change events so active services update their behavior on-the-fly without restarting!
 */

const path = require('path');
const { EventEmitter } = require('events');

class DynamicConfig extends EventEmitter {
  constructor() {
    super();

    // 1. Server Environment
    this.server = {
      port: parseInt(process.env.PORT, 10) || 3000,
      host: process.env.HOST || '0.0.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
      corsOrigin: process.env.CORS_ORIGIN || '*',
      redisUrl: process.env.REDIS_URL || '',
      wsPath: process.env.WS_PATH || '/ws/whiteboard'
    };

    // 2. Collaborative Whiteboard (Module 1)
    this.whiteboard = {
      boardId: process.env.WHITEBOARD_ID || 'main-canvas',
      compactionThreshold: parseInt(process.env.WHITEBOARD_COMPACTION_THRESHOLD, 10) || 50,
      maxOperationLogSize: parseInt(process.env.WHITEBOARD_MAX_LOG_SIZE, 10) || 100
    };

    // 3. Feature Flag Engine (Module 2)
    this.featureFlags = {
      simulatedNetworkLatencyMs: parseInt(process.env.FLAGS_SIMULATED_LATENCY_MS, 10) || 45,
      hashModulus: parseInt(process.env.FLAGS_HASH_MODULUS, 10) || 100
    };

    // 4. Social Post & Event Scheduler (Module 3)
    this.scheduler = {
      workerIntervalMs: parseInt(process.env.SCHEDULER_WORKER_INTERVAL_MS, 10) || 1000,
      maxRetries: parseInt(process.env.SCHEDULER_MAX_RETRIES, 10) || 3,
      failureRate: parseFloat(process.env.SCHEDULER_FAILURE_RATE) || 0.0,
      backoffBaseMs: parseInt(process.env.SCHEDULER_BACKOFF_BASE_MS, 10) || 1000,
      maxAuditLogs: parseInt(process.env.SCHEDULER_MAX_AUDIT_LOGS, 10) || 50
    };

    // 5. API Rate Limiter Gateway (Module 4)
    this.rateLimiter = {
      defaultAlgorithm: process.env.RATELIMIT_DEFAULT_ALGO || 'token_bucket',
      freeCapacity: parseInt(process.env.RATELIMIT_FREE_CAPACITY, 10) || 5,
      freeRefillRate: parseFloat(process.env.RATELIMIT_FREE_REFILL_RATE) || 1,
      freeRefillPerSec: parseFloat(process.env.RATELIMIT_FREE_REFILL_PER_SEC) || 0.5,
      freeWindowMs: parseInt(process.env.RATELIMIT_FREE_WINDOW_MS, 10) || 15000,
      proCapacity: parseInt(process.env.RATELIMIT_PRO_CAPACITY, 10) || 20,
      proRefillRate: parseFloat(process.env.RATELIMIT_PRO_REFILL_RATE) || 5,
      proRefillPerSec: parseFloat(process.env.RATELIMIT_PRO_REFILL_PER_SEC) || 2.0,
      proWindowMs: parseInt(process.env.RATELIMIT_PRO_WINDOW_MS, 10) || 15000,
      maxLogEntries: parseInt(process.env.RATELIMIT_MAX_LOG_ENTRIES, 10) || 50
    };

    // 6. Activity Feed & Fan-Out (Module 5)
    this.feed = {
      fanOutMode: process.env.FEED_DEFAULT_FANOUT_MODE || 'hybrid',
      celebrityThreshold: parseInt(process.env.FEED_CELEBRITY_THRESHOLD, 10) || 5,
      defaultFeedLimit: parseInt(process.env.FEED_DEFAULT_LIMIT, 10) || 10,
      maxInboxSize: parseInt(process.env.FEED_MAX_INBOX_SIZE, 10) || 200
    };

    // 7. Distributed Object Storage (Module 6)
    this.storage = {
      baseDir: process.env.STORAGE_DATA_DIR || path.join(__dirname, 'data', 'storage_nodes'),
      nodes: process.env.STORAGE_NODES ? process.env.STORAGE_NODES.split(',').map(s => s.trim()) : ['node_a', 'node_b', 'node_c'],
      replicationFactor: parseInt(process.env.STORAGE_REPLICATION_FACTOR, 10) || 2,
      chunkSize: parseInt(process.env.STORAGE_CHUNK_SIZE, 10) || 64,
      sampleDocRepeat: parseInt(process.env.STORAGE_SAMPLE_REPEAT, 10) || 5
    };

    // 8. Floci Local Cloud Integration (Module 8)
    this.floci = {
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
      uiUrl: process.env.FLOCI_UI_URL || 'http://localhost:4500',
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      defaultBucket: process.env.FLOCI_S3_DEFAULT_BUCKET || 'syslab-cloud-bucket',
      defaultQueue: process.env.FLOCI_SQS_DEFAULT_QUEUE || 'syslab-posts-queue',
      defaultTable: process.env.FLOCI_DYNAMO_DEFAULT_TABLE || 'SysLabFlags',
      timeoutMs: parseInt(process.env.FLOCI_TIMEOUT_MS, 10) || 5000
    };

    // 9. Real-Time Team Simulation
    this.team = {
      active: process.env.TEAM_SIM_ACTIVE !== 'false',
      intervalMs: parseInt(process.env.TEAM_SIM_INTERVAL_MS, 10) || 4500,
      maxRecentEvents: parseInt(process.env.TEAM_MAX_RECENT_EVENTS, 10) || 30
    };
  }

  /**
   * Dynamically update configuration on-the-fly at runtime
   */
  update(section, partial) {
    if (!this[section] || typeof partial !== 'object') {
      throw new Error(`Invalid configuration section: '${section}'`);
    }

    const previous = { ...this[section] };
    this[section] = {
      ...this[section],
      ...partial
    };

    this.emit('change', { section, current: this[section], previous });
    this.emit(`change:${section}`, { current: this[section], previous });
    return this[section];
  }

  getAll() {
    return {
      server: this.server,
      whiteboard: this.whiteboard,
      featureFlags: this.featureFlags,
      scheduler: this.scheduler,
      rateLimiter: this.rateLimiter,
      feed: this.feed,
      storage: this.storage,
      floci: this.floci,
      team: this.team
    };
  }
}

module.exports = new DynamicConfig();
