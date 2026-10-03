/**
 * System Design Module 4: API Rate Limiter Gateway
 * 
 * Core System Design Principles:
 * 1. Dual Rate Limiting Algorithms:
 *    - Token Bucket: Refills tokens smoothly at rate R up to max capacity C.
 *      Allows short burst traffic while strictly controlling sustained throughput.
 *    - Sliding Window Counter: Tracks timestamped requests across a rolling time
 *      window W, eliminating boundary edge burst vulnerabilities of Fixed Windows.
 * 2. Standardized Rate Limit Headers:
 *    Enforces RFC-standardized headers:
 *    `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.
 * 3. Atomic State Management:
 *    Thread-safe / atomic counters (mimicking Redis EVAL scripts or INCR/EXPIRE).
 * 4. Multi-Tenant Tiers:
 *    Different capacity & refill rules per client API key / tier (Free vs Pro).
 */

class RateLimiterService {
  constructor() {
    this.selectedAlgorithm = 'token_bucket'; // 'token_bucket' | 'sliding_window'

    // Configuration tiers
    this.tiers = {
      free: {
        capacity: 5,        // Max burst bucket capacity
        refillRate: 1,      // 1 token every 2 seconds (0.5 tokens/sec)
        refillPerSec: 0.5,
        windowMs: 15000,    // Sliding window 15 seconds
        windowLimit: 5      // 5 requests per 15s window
      },
      pro: {
        capacity: 20,       // Max burst
        refillRate: 5,
        refillPerSec: 2.0,  // 2 tokens/sec
        windowMs: 15000,
        windowLimit: 20
      }
    };

    // Client buckets: key -> { tokens, lastRefillTimestamp }
    this.tokenBuckets = new Map();

    // Client sliding windows: key -> [timestamp, timestamp, ...]
    this.slidingWindows = new Map();

    // Request trace log for visualizer
    this.requestLog = [];

    // Metrics
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      clientCount: 0
    };
  }

  setAlgorithm(algo) {
    if (algo === 'token_bucket' || algo === 'sliding_window') {
      this.selectedAlgorithm = algo;
    }
  }

  /**
   * Main middleware entry point to check rate limit for a client key
   */
  checkLimit(clientKey = 'user_default', tier = 'free') {
    this.metrics.totalRequests++;
    const config = this.tiers[tier] || this.tiers.free;
    const now = Date.now();

    let result;
    if (this.selectedAlgorithm === 'token_bucket') {
      result = this.evaluateTokenBucket(clientKey, config, now);
    } else {
      result = this.evaluateSlidingWindow(clientKey, config, now);
    }

    if (result.allowed) {
      this.metrics.allowedRequests++;
    } else {
      this.metrics.blockedRequests++;
    }

    // Log request trace for visual inspector
    this.requestLog.unshift({
      id: Math.random().toString(36).substring(2, 8),
      time: new Date().toLocaleTimeString(),
      timestamp: now,
      clientKey,
      tier,
      algo: this.selectedAlgorithm,
      allowed: result.allowed,
      remaining: result.remaining,
      limit: result.limit,
      retryAfter: result.retryAfter
    });
    if (this.requestLog.length > 40) this.requestLog.pop();

    return result;
  }

  /**
   * Algorithm 1: Token Bucket
   */
  evaluateTokenBucket(clientKey, config, now) {
    let bucket = this.tokenBuckets.get(clientKey);

    if (!bucket) {
      bucket = {
        tokens: config.capacity,
        lastRefill: now
      };
      this.tokenBuckets.set(clientKey, bucket);
    } else {
      // Calculate token refill based on delta time: (now - lastRefill) * refillPerSec
      const elapsedSeconds = (now - bucket.lastRefill) / 1000;
      const refilledTokens = elapsedSeconds * config.refillPerSec;
      bucket.tokens = Math.min(config.capacity, bucket.tokens + refilledTokens);
      bucket.lastRefill = now;
    }

    const currentTokens = Math.floor(bucket.tokens);

    if (currentTokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        status: 200,
        limit: config.capacity,
        remaining: Math.floor(bucket.tokens),
        resetSeconds: Math.ceil((config.capacity - bucket.tokens) / config.refillPerSec),
        headers: {
          'X-RateLimit-Limit': config.capacity,
          'X-RateLimit-Remaining': Math.floor(bucket.tokens),
          'X-RateLimit-Reset': Math.ceil((config.capacity - bucket.tokens) / config.refillPerSec)
        }
      };
    } else {
      // Bucket empty: Throttled!
      const secondsUntilNextToken = Math.ceil((1 - bucket.tokens) / config.refillPerSec);
      return {
        allowed: false,
        status: 429,
        limit: config.capacity,
        remaining: 0,
        retryAfter: secondsUntilNextToken,
        resetSeconds: secondsUntilNextToken,
        headers: {
          'X-RateLimit-Limit': config.capacity,
          'X-RateLimit-Remaining': 0,
          'Retry-After': secondsUntilNextToken
        }
      };
    }
  }

  /**
   * Algorithm 2: Sliding Window Log
   */
  evaluateSlidingWindow(clientKey, config, now) {
    let timestamps = this.slidingWindows.get(clientKey);
    if (!timestamps) {
      timestamps = [];
      this.slidingWindows.set(clientKey, timestamps);
    }

    // Filter out timestamps older than current window (now - windowMs)
    const windowStart = now - config.windowMs;
    timestamps = timestamps.filter(ts => ts > windowStart);
    this.slidingWindows.set(clientKey, timestamps);

    if (timestamps.length < config.windowLimit) {
      timestamps.push(now);
      const remaining = config.windowLimit - timestamps.length;
      const oldest = timestamps[0];
      const resetSeconds = Math.ceil((oldest + config.windowMs - now) / 1000);

      return {
        allowed: true,
        status: 200,
        limit: config.windowLimit,
        remaining,
        resetSeconds,
        headers: {
          'X-RateLimit-Limit': config.windowLimit,
          'X-RateLimit-Remaining': remaining,
          'X-RateLimit-Reset': resetSeconds
        }
      };
    } else {
      // Window full: Throttled!
      const oldest = timestamps[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000));

      return {
        allowed: false,
        status: 429,
        limit: config.windowLimit,
        remaining: 0,
        retryAfter,
        resetSeconds: retryAfter,
        headers: {
          'X-RateLimit-Limit': config.windowLimit,
          'X-RateLimit-Remaining': 0,
          'Retry-After': retryAfter
        }
      };
    }
  }

  /**
   * Simulated OpenAI LLM Completion call guarded by rate limiter
   */
  simulateOpenAiCall(clientKey, tier, prompt) {
    const rateCheck = this.checkLimit(clientKey, tier);
    if (!rateCheck.allowed) {
      return {
        success: false,
        status: 429,
        error: 'Too Many Requests: Rate limit quota exceeded.',
        rateCheck
      };
    }

    // Simulated OpenAI response
    const mockResponses = [
      `System Architecture Insight: Consider applying CQRS pattern for read-heavy feed pipelines.`,
      `Rate Limiter Feedback: Request accepted. In-memory sliding window evaluated in 0.04ms.`,
      `Design Advice: Always use Content-Addressable Hashes (SHA-256) for chunked file deduplication.`,
      `OpenAI Gateway Mock: Delta-based WebSockets minimize payload serialization overhead.`
    ];
    const reply = mockResponses[Math.floor(Math.random() * mockResponses.length)];

    return {
      success: true,
      status: 200,
      prompt,
      model: 'gpt-4o-mock',
      completion: reply,
      rateCheck
    };
  }

  getClientState(clientKey = 'user_default', tier = 'free') {
    const config = this.tiers[tier] || this.tiers.free;
    const bucket = this.tokenBuckets.get(clientKey);
    const windowLogs = this.slidingWindows.get(clientKey) || [];
    const now = Date.now();

    let tokens = config.capacity;
    if (bucket) {
      const elapsedSeconds = (now - bucket.lastRefill) / 1000;
      tokens = Math.min(config.capacity, bucket.tokens + (elapsedSeconds * config.refillPerSec));
    }

    const activeInWindow = windowLogs.filter(ts => ts > (now - config.windowMs)).length;

    return {
      clientKey,
      tier,
      algorithm: this.selectedAlgorithm,
      tokenBucket: {
        currentTokens: Number(tokens.toFixed(2)),
        capacity: config.capacity,
        fillPercent: Math.min(100, Math.max(0, (tokens / config.capacity) * 100)).toFixed(1),
        refillPerSec: config.refillPerSec
      },
      slidingWindow: {
        activeRequests: activeInWindow,
        limit: config.windowLimit,
        windowMs: config.windowMs,
        usagePercent: Math.min(100, (activeInWindow / config.windowLimit) * 100).toFixed(1)
      }
    };
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeAlgorithm: this.selectedAlgorithm,
      requestLog: this.requestLog.slice(0, 15)
    };
  }
}

module.exports = new RateLimiterService();
