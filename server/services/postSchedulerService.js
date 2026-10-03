/**
 * System Design Module 3: Social Post / Event Scheduler
 * 
 * Core System Design Principles:
 * 1. Delayed Job Queue:
 *    Jobs are scheduled for future execution (scheduledAt timestamp).
 *    Sorted by trigger time (in-memory Priority Queue / Redis ZSET pattern).
 * 2. Idempotency Key Enforcer:
 *    Clients provide a unique `idempotencyKey`. If a client retries due to a
 *    network timeout, the service detects the key, avoiding duplicate posts
 *    and returning the existing job immediately.
 * 3. Worker Tick & Distributed Lock Simulation:
 *    A polling worker claims due jobs atomically (`status = 'processing'`).
 *    This prevents split-brain duplicate worker execution.
 * 4. Exponential Backoff Retries:
 *    On simulated network or downstream API failure, jobs back off:
 *    `delay = 2^attempt * 1000ms`, up to `maxRetries`.
 * 5. Dead-Letter Queue (DLQ):
 *    Unrecoverable jobs transition to `dlq` state for manual inspection,
 *    preventing head-of-line blocking (poison pill prevention).
 */

const crypto = require('crypto');

class PostSchedulerService {
  constructor() {
    // All jobs: jobId -> jobObject
    this.jobs = new Map();
    // Idempotency index: idempotencyKey -> jobId
    this.idempotencyIndex = new Map();
    // Dead Letter Queue: Set of jobIds
    this.dlq = new Set();
    
    // Worker execution log
    this.auditLog = [];

    // Worker configuration
    this.workerIntervalMs = 1000;
    this.workerTimer = null;
    this.simulatedFailureRate = 0.0; // 0% by default, can be toggled by user in UI to test retries!
    this.maxRetries = 3;

    // Metrics
    this.metrics = {
      totalScheduled: 0,
      totalPublished: 0,
      idempotentDuplicatesBlocked: 0,
      retriesTriggered: 0,
      dlqCount: 0
    };

    this.startWorker();
    this.initSampleJobs();
  }

  initSampleJobs() {
    const now = Date.now();
    this.schedulePost({
      content: '🚀 Launching SysLab v1.0! The interactive system design workbench.',
      platform: 'Twitter / X',
      scheduledAt: now + 5000,
      idempotencyKey: 'syslab-launch-announcement-001'
    });

    this.schedulePost({
      content: '📝 Deep dive into WebSockets vs Server-Sent Events architecture.',
      platform: 'LinkedIn',
      scheduledAt: now + 15000,
      idempotencyKey: 'syslab-deepdive-post-002'
    });
  }

  /**
   * Schedule a post with idempotency guarantee
   */
  schedulePost({ content, platform = 'Twitter / X', scheduledAt, idempotencyKey }) {
    // 1. Idempotency Key validation
    const key = idempotencyKey || `idem-${crypto.randomBytes(8).toString('hex')}`;
    
    if (this.idempotencyIndex.has(key)) {
      const existingJobId = this.idempotencyIndex.get(key);
      const existingJob = this.jobs.get(existingJobId);
      this.metrics.idempotentDuplicatesBlocked++;
      this.logAudit(`[IDEMPOTENCY BLOCKED] Duplicate submission detected for key: ${key}. Returning original Job ID: ${existingJobId}`);
      return {
        job: existingJob,
        isDuplicate: true,
        message: 'Duplicate request detected and safely deduplicated by idempotency key.'
      };
    }

    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const targetTime = Number(scheduledAt) || (Date.now() + 10000);

    const job = {
      id: jobId,
      content,
      platform,
      scheduledAt: targetTime,
      createdAt: Date.now(),
      idempotencyKey: key,
      status: 'queued', // 'queued' | 'processing' | 'published' | 'retrying' | 'dlq'
      attempts: 0,
      maxRetries: this.maxRetries,
      publishedAt: null,
      lastError: null,
      history: [
        { time: Date.now(), status: 'queued', note: `Job queued for ${new Date(targetTime).toLocaleTimeString()}` }
      ]
    };

    this.jobs.set(jobId, job);
    this.idempotencyIndex.set(key, jobId);
    this.metrics.totalScheduled++;

    this.logAudit(`[JOB QUEUED] Job #${jobId} scheduled for ${new Date(targetTime).toLocaleTimeString()} with key: ${key}`);

    return {
      job,
      isDuplicate: false,
      message: 'Job scheduled successfully.'
    };
  }

  /**
   * Worker tick: runs every second to check for due jobs
   */
  startWorker() {
    if (this.workerTimer) clearInterval(this.workerTimer);
    this.workerTimer = setInterval(() => this.processDueJobs(), this.workerIntervalMs);
  }

  stopWorker() {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  async processDueJobs() {
    const now = Date.now();
    const dueJobs = [];

    // Find jobs that are ready to run
    for (const job of this.jobs.values()) {
      if ((job.status === 'queued' || job.status === 'retrying') && job.scheduledAt <= now) {
        dueJobs.push(job);
      }
    }

    if (dueJobs.length === 0) return;

    for (const job of dueJobs) {
      // 1. Acquire "Lock" (Transition status to processing atomically)
      job.status = 'processing';
      job.attempts++;
      job.history.push({
        time: now,
        status: 'processing',
        note: `Worker picked up job. Attempt ${job.attempts}/${job.maxRetries}`
      });
      this.logAudit(`[WORKER PROCESSING] Attempting Job #${job.id} (Attempt ${job.attempts})`);

      // 2. Execute publishing (with simulated external network failure possibility)
      const isFailed = Math.random() < this.simulatedFailureRate;

      if (isFailed) {
        this.handleFailure(job, 'Downstream API gateway timeout (504 Gateway Error)');
      } else {
        this.handleSuccess(job);
      }
    }
  }

  handleSuccess(job) {
    job.status = 'published';
    job.publishedAt = Date.now();
    job.lastError = null;
    job.history.push({
      time: Date.now(),
      status: 'published',
      note: `Successfully published to ${job.platform}`
    });
    this.metrics.totalPublished++;
    this.logAudit(`[SUCCESS] Job #${job.id} successfully published to ${job.platform}`);
  }

  handleFailure(job, errorMessage) {
    job.lastError = errorMessage;
    this.metrics.retriesTriggered++;

    if (job.attempts < job.maxRetries) {
      // Exponential backoff: 2s, 4s, 8s...
      const backoffDelay = Math.pow(2, job.attempts) * 1000;
      job.status = 'retrying';
      job.scheduledAt = Date.now() + backoffDelay;
      job.history.push({
        time: Date.now(),
        status: 'retrying',
        note: `Failed: ${errorMessage}. Backing off for ${backoffDelay / 1000}s`
      });
      this.logAudit(`[RETRY] Job #${job.id} failed. Next retry in ${backoffDelay / 1000}s`);
    } else {
      // Exceeded max retries -> Move to Dead Letter Queue (DLQ)
      job.status = 'dlq';
      this.dlq.add(job.id);
      this.metrics.dlqCount = this.dlq.size;
      job.history.push({
        time: Date.now(),
        status: 'dlq',
        note: `Exceeded ${job.maxRetries} max retries. Moved to Dead Letter Queue.`
      });
      this.logAudit(`[DLQ ALERT] Job #${job.id} moved to Dead-Letter Queue!`);
    }
  }

  /**
   * Re-drive a job from DLQ
   */
  redriveJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'dlq') return null;

    job.status = 'queued';
    job.attempts = 0;
    job.scheduledAt = Date.now();
    job.lastError = null;
    this.dlq.delete(jobId);
    this.metrics.dlqCount = this.dlq.size;
    job.history.push({
      time: Date.now(),
      status: 'queued',
      note: 'Manually re-driven from DLQ'
    });
    this.logAudit(`[DLQ REDRIVE] Job #${jobId} manually re-driven back to queue.`);
    return job;
  }

  setSimulatedFailureRate(rate) {
    this.simulatedFailureRate = Math.max(0, Math.min(1, rate));
    this.logAudit(`[CONFIG] Worker failure rate updated to ${(this.simulatedFailureRate * 100).toFixed(0)}%`);
  }

  logAudit(message) {
    this.auditLog.unshift({
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now(),
      message
    });
    if (this.auditLog.length > 50) this.auditLog.pop();
  }

  getAllJobs() {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeQueuedCount: Array.from(this.jobs.values()).filter(j => j.status === 'queued' || j.status === 'retrying').length,
      simulatedFailureRatePercent: `${(this.simulatedFailureRate * 100).toFixed(0)}%`,
      auditLogs: this.auditLog.slice(0, 15)
    };
  }
}

module.exports = new PostSchedulerService();
