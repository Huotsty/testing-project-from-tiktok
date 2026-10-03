/**
 * System Design Module 2: High-Performance Feature Flag Service
 * 
 * Core System Design Principles:
 * 1. Low-Latency Local Reads (<0.1ms):
 *    Clients download the full flag configuration once into local memory.
 *    Flag evaluation (isEnabled) runs completely offline in-memory, avoiding
 *    a network round-trip per evaluation.
 * 2. Streaming Real-Time Cache Sync (Server-Sent Events / SSE):
 *    Instead of aggressive polling, clients maintain an open SSE stream.
 *    When flags change, the server broadcasts an atomic invalidation delta.
 * 3. Deterministic Consistent Rollouts (Hashing):
 *    Percentage-based rollouts use MD5/FNV-1a hashing of (userId + flagKey) % 100.
 *    This ensures that user X always gets the same variation without server session state.
 * 4. User Targeting Rules & Kill Switches:
 *    Immediate kill switch propagation to mitigate production incidents.
 */

const crypto = require('crypto');
const config = require('../config');

class FeatureFlagService {
  constructor() {
    this.version = 1;
    // Central flag definitions store: Map of key -> flagObject
    this.flags = new Map();
    // Connected SSE clients: Set of res streams
    this.sseClients = new Set();

    // Telemetry & metrics
    this.metrics = {
      evaluationsCount: 0,
      cacheInvalidationsPushed: 0,
      connectedStreamClients: 0,
      simulatedLatencySavingsMs: 0 // Compared to 45ms per remote HTTP check
    };

    this.initDefaultFlags();
  }

  initDefaultFlags() {
    this.createFlag({
      key: 'whiteboard_ai_assistant',
      name: 'AI Whiteboard Co-Pilot',
      description: 'Enables real-time shape auto-completion and diagram suggestions on canvas',
      enabled: true,
      rolloutPercentage: 100,
      targetUsers: ['beta-tester', 'architect-vip']
    });

    this.createFlag({
      key: 'dark_neon_theme',
      name: 'Cyberpunk Neon Canvas Mode',
      description: 'Ultra high-contrast dark neon styling for late night architecture reviews',
      enabled: false,
      rolloutPercentage: 50,
      targetUsers: []
    });

    this.createFlag({
      key: 'storage_chunk_compression',
      name: 'Storage Gzip Chunk Compression',
      description: 'Compress file chunks before hashing and storing on cluster nodes',
      enabled: true,
      rolloutPercentage: 100,
      targetUsers: []
    });

    this.createFlag({
      key: 'experimental_post_scheduler_dlq',
      name: 'Dead Letter Queue Automatic Re-drive',
      description: 'Automatically attempts re-delivery of failed scheduled posts after 10m',
      enabled: false,
      rolloutPercentage: 20,
      targetUsers: ['admin']
    });
  }

  getAllFlags() {
    return Array.from(this.flags.values());
  }

  getFlag(key) {
    return this.flags.get(key);
  }

  createFlag(flagData) {
    const flag = {
      key: flagData.key,
      name: flagData.name || flagData.key,
      description: flagData.description || '',
      enabled: flagData.enabled ?? false,
      rolloutPercentage: Math.max(0, Math.min(100, flagData.rolloutPercentage ?? 100)),
      targetUsers: flagData.targetUsers || [],
      updatedAt: Date.now(),
      version: ++this.version
    };
    this.flags.set(flag.key, flag);
    this.broadcastDelta({ type: 'flag_updated', flag });
    return flag;
  }

  updateFlag(key, updates) {
    const existing = this.flags.get(key);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
      version: ++this.version
    };
    this.flags.set(key, updated);
    this.broadcastDelta({ type: 'flag_updated', flag: updated });
    return updated;
  }

  toggleFlag(key) {
    const existing = this.flags.get(key);
    if (!existing) return null;
    return this.updateFlag(key, { enabled: !existing.enabled });
  }

  deleteFlag(key) {
    const deleted = this.flags.delete(key);
    if (deleted) {
      this.version++;
      this.broadcastDelta({ type: 'flag_deleted', key, version: this.version });
    }
    return deleted;
  }

  /**
   * Deterministic evaluation algorithm (runnable both server-side & client-side SDK)
   * 1. If flag is disabled globally -> false
   * 2. If user is in targetUsers explicit whitelist -> true
   * 3. Consistent hashing: hash(userId + ":" + flagKey) % 100 < rolloutPercentage
   */
  evaluate(key, userId = 'anonymous') {
    this.metrics.evaluationsCount++;
    this.metrics.simulatedLatencySavingsMs += (config.featureFlags.simulatedNetworkLatencyMs || 45);

    const flag = this.flags.get(key);
    if (!flag) return { key, enabled: false, reason: 'FLAG_NOT_FOUND' };
    if (!flag.enabled) return { key, enabled: false, reason: 'FLAG_DISABLED' };

    // Explicit user targeting whitelist
    if (flag.targetUsers && flag.targetUsers.includes(userId)) {
      return { key, enabled: true, reason: 'USER_TARGETED' };
    }

    // 100% rollout check
    if (flag.rolloutPercentage >= 100) {
      return { key, enabled: true, reason: 'FULL_ROLLOUT' };
    }

    // 0% rollout check
    if (flag.rolloutPercentage <= 0) {
      return { key, enabled: false, reason: 'ZERO_ROLLOUT' };
    }

    // Deterministic hash bucket
    const modulus = config.featureFlags.hashModulus || 100;
    const hash = crypto.createHash('md5').update(`${userId}:${key}`).digest('hex');
    const bucket = parseInt(hash.substring(0, 8), 16) % modulus;
    const enabled = bucket < flag.rolloutPercentage;

    return {
      key,
      enabled,
      bucket,
      rolloutPercentage: flag.rolloutPercentage,
      reason: enabled ? 'PERCENTAGE_ROLLOUT_INCLUDED' : 'PERCENTAGE_ROLLOUT_EXCLUDED'
    };
  }

  /**
   * SSE Stream management
   */
  addSseClient(res) {
    this.sseClients.add(res);
    this.metrics.connectedStreamClients = this.sseClients.size;

    // Send initial config payload upon connection
    const payload = JSON.stringify({
      type: 'initial_config',
      version: this.version,
      flags: this.getAllFlags()
    });
    res.write(`data: ${payload}\n\n`);

    res.on('close', () => {
      this.sseClients.delete(res);
      this.metrics.connectedStreamClients = this.sseClients.size;
    });
  }

  broadcastDelta(data) {
    this.metrics.cacheInvalidationsPushed++;
    const payload = JSON.stringify(data);
    for (const client of this.sseClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
    this.metrics.connectedStreamClients = this.sseClients.size;
  }

  getMetrics() {
    return {
      ...this.metrics,
      flagsCount: this.flags.size,
      currentVersion: this.version
    };
  }
}

module.exports = new FeatureFlagService();
