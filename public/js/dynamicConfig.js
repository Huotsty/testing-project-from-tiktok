/**
 * Module 9: Dynamic Configuration & Runtime Variables Manager
 * 
 * Provides live hot-mutation controls for all 9 distributed system modules.
 * Changes take effect immediately across all background services without restarts!
 */

const DynamicConfigClient = {
  currentConfig: null,

  init() {
    this.fetchConfig();
    this.bindEvents();
  },

  async fetchConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success && data.config) {
        this.currentConfig = data.config;
        this.renderConfigForm();
        this.renderRawJson();
      }
    } catch (err) {
      console.error('Failed to fetch dynamic config:', err);
    }
  },

  renderConfigForm() {
    if (!this.currentConfig) return;
    const cfg = this.currentConfig;

    // Rate Limiter inputs
    this.setVal('cfg-rate-algo', cfg.rateLimiter?.defaultAlgorithm || 'token_bucket');
    this.setVal('cfg-rate-free-cap', cfg.rateLimiter?.freeCapacity ?? 5);
    this.setVal('cfg-rate-free-refill', cfg.rateLimiter?.freeRefillPerSec ?? 0.5);
    this.setVal('cfg-rate-free-win', (cfg.rateLimiter?.freeWindowMs ?? 15000) / 1000);
    this.setVal('cfg-rate-pro-cap', cfg.rateLimiter?.proCapacity ?? 20);
    this.setVal('cfg-rate-pro-refill', cfg.rateLimiter?.proRefillPerSec ?? 2.0);
    this.setVal('cfg-rate-pro-win', (cfg.rateLimiter?.proWindowMs ?? 15000) / 1000);

    // Storage inputs
    this.setVal('cfg-storage-rf', cfg.storage?.replicationFactor ?? 2);
    this.setVal('cfg-storage-chunk', cfg.storage?.chunkSize ?? 64);
    this.setVal('cfg-storage-repeat', cfg.storage?.sampleDocRepeat ?? 5);
    const rfValLabel = document.getElementById('cfg-storage-rf-val');
    if (rfValLabel) rfValLabel.textContent = cfg.storage?.replicationFactor ?? 2;

    // Scheduler inputs
    this.setVal('cfg-sched-interval', cfg.scheduler?.workerIntervalMs ?? 1000);
    this.setVal('cfg-sched-retries', cfg.scheduler?.maxRetries ?? 3);
    this.setVal('cfg-sched-failrate', (cfg.scheduler?.failureRate ?? 0) * 100);
    const failRateLabel = document.getElementById('cfg-sched-failrate-val');
    if (failRateLabel) failRateLabel.textContent = `${((cfg.scheduler?.failureRate ?? 0) * 100).toFixed(0)}%`;
    this.setVal('cfg-sched-backoff', cfg.scheduler?.backoffBaseMs ?? 1000);

    // Feed inputs
    this.setVal('cfg-feed-mode', cfg.feed?.fanOutMode || 'hybrid');
    this.setVal('cfg-feed-celeb', cfg.feed?.celebrityThreshold ?? 5);
    this.setVal('cfg-feed-limit', cfg.feed?.defaultFeedLimit ?? 10);
    this.setVal('cfg-feed-inbox', cfg.feed?.maxInboxSize ?? 200);

    // Floci inputs
    this.setVal('cfg-floci-endpoint', cfg.floci?.endpoint || 'http://localhost:4566');
    this.setVal('cfg-floci-ui', cfg.floci?.uiUrl || 'http://localhost:4500');
    this.setVal('cfg-floci-region', cfg.floci?.region || 'us-east-1');
    this.setVal('cfg-floci-bucket', cfg.floci?.defaultBucket || 'syslab-cloud-bucket');
    this.setVal('cfg-floci-queue', cfg.floci?.defaultQueue || 'syslab-posts-queue');
    this.setVal('cfg-floci-table', cfg.floci?.defaultTable || 'SysLabFlags');

    // Team inputs
    this.setVal('cfg-team-interval', cfg.team?.intervalMs ?? 4500);
    this.setVal('cfg-team-maxevents', cfg.team?.maxRecentEvents ?? 30);
    const teamActiveEl = document.getElementById('cfg-team-active');
    if (teamActiveEl) teamActiveEl.checked = cfg.team?.active !== false;

    // Whiteboard & Flags inputs
    this.setVal('cfg-wb-compaction', cfg.whiteboard?.compactionThreshold ?? 50);
    this.setVal('cfg-flags-latency', cfg.featureFlags?.simulatedNetworkLatencyMs ?? 45);
    this.setVal('cfg-flags-modulus', cfg.featureFlags?.hashModulus ?? 100);
  },

  renderRawJson() {
    const rawEl = document.getElementById('cfg-raw-json-viewer');
    if (rawEl && this.currentConfig) {
      rawEl.textContent = JSON.stringify(this.currentConfig, null, 2);
    }
  },

  setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  },

  bindEvents() {
    // Slider label sync
    const rfSlider = document.getElementById('cfg-storage-rf');
    if (rfSlider) {
      rfSlider.addEventListener('input', (e) => {
        const valEl = document.getElementById('cfg-storage-rf-val');
        if (valEl) valEl.textContent = e.target.value;
      });
    }

    const failSlider = document.getElementById('cfg-sched-failrate');
    if (failSlider) {
      failSlider.addEventListener('input', (e) => {
        const valEl = document.getElementById('cfg-sched-failrate-val');
        if (valEl) valEl.textContent = `${e.target.value}%`;
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('cfg-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.fetchConfig().then(() => this.showToast('✅ Configuration refreshed from server!'));
      });
    }

    // Copy JSON button
    const copyBtn = document.getElementById('cfg-copy-json-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (this.currentConfig) {
          navigator.clipboard.writeText(JSON.stringify(this.currentConfig, null, 2));
          this.showToast('📋 Copied full config JSON to clipboard!');
        }
      });
    }

    // Section save buttons
    this.bindSave('cfg-save-ratelimit-btn', 'rateLimiter', () => ({
      defaultAlgorithm: document.getElementById('cfg-rate-algo')?.value || 'token_bucket',
      freeCapacity: parseInt(document.getElementById('cfg-rate-free-cap')?.value, 10) || 5,
      freeRefillPerSec: parseFloat(document.getElementById('cfg-rate-free-refill')?.value) || 0.5,
      freeWindowMs: (parseInt(document.getElementById('cfg-rate-free-win')?.value, 10) || 15) * 1000,
      proCapacity: parseInt(document.getElementById('cfg-rate-pro-cap')?.value, 10) || 20,
      proRefillPerSec: parseFloat(document.getElementById('cfg-rate-pro-refill')?.value) || 2.0,
      proWindowMs: (parseInt(document.getElementById('cfg-rate-pro-win')?.value, 10) || 15) * 1000
    }));

    this.bindSave('cfg-save-storage-btn', 'storage', () => ({
      replicationFactor: parseInt(document.getElementById('cfg-storage-rf')?.value, 10) || 2,
      chunkSize: parseInt(document.getElementById('cfg-storage-chunk')?.value, 10) || 64,
      sampleDocRepeat: parseInt(document.getElementById('cfg-storage-repeat')?.value, 10) || 5
    }));

    this.bindSave('cfg-save-scheduler-btn', 'scheduler', () => ({
      workerIntervalMs: parseInt(document.getElementById('cfg-sched-interval')?.value, 10) || 1000,
      maxRetries: parseInt(document.getElementById('cfg-sched-retries')?.value, 10) || 3,
      failureRate: (parseFloat(document.getElementById('cfg-sched-failrate')?.value) || 0) / 100,
      backoffBaseMs: parseInt(document.getElementById('cfg-sched-backoff')?.value, 10) || 1000
    }));

    this.bindSave('cfg-save-feed-btn', 'feed', () => ({
      fanOutMode: document.getElementById('cfg-feed-mode')?.value || 'hybrid',
      celebrityThreshold: parseInt(document.getElementById('cfg-feed-celeb')?.value, 10) || 5,
      defaultFeedLimit: parseInt(document.getElementById('cfg-feed-limit')?.value, 10) || 10,
      maxInboxSize: parseInt(document.getElementById('cfg-feed-inbox')?.value, 10) || 200
    }));

    this.bindSave('cfg-save-floci-btn', 'floci', () => ({
      endpoint: document.getElementById('cfg-floci-endpoint')?.value || 'http://localhost:4566',
      uiUrl: document.getElementById('cfg-floci-ui')?.value || 'http://localhost:4500',
      region: document.getElementById('cfg-floci-region')?.value || 'us-east-1',
      defaultBucket: document.getElementById('cfg-floci-bucket')?.value || 'syslab-cloud-bucket',
      defaultQueue: document.getElementById('cfg-floci-queue')?.value || 'syslab-posts-queue',
      defaultTable: document.getElementById('cfg-floci-table')?.value || 'SysLabFlags'
    }));

    this.bindSave('cfg-save-team-btn', 'team', () => ({
      active: document.getElementById('cfg-team-active')?.checked ?? true,
      intervalMs: parseInt(document.getElementById('cfg-team-interval')?.value, 10) || 4500,
      maxRecentEvents: parseInt(document.getElementById('cfg-team-maxevents')?.value, 10) || 30
    }));

    this.bindSave('cfg-save-whiteboard-flags-btn', 'whiteboard', () => ({
      compactionThreshold: parseInt(document.getElementById('cfg-wb-compaction')?.value, 10) || 50
    }), async () => {
      // also patch featureFlags
      await this.patchSection('featureFlags', {
        simulatedNetworkLatencyMs: parseInt(document.getElementById('cfg-flags-latency')?.value, 10) || 45,
        hashModulus: parseInt(document.getElementById('cfg-flags-modulus')?.value, 10) || 100
      });
    });
  },

  bindSave(btnId, section, payloadFn, extraFn) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ Applying...';

      try {
        const payload = payloadFn();
        await this.patchSection(section, payload);
        if (extraFn) await extraFn();
        await this.fetchConfig();
        this.showToast(`⚡ Successfully hot-updated [${section}]!`);
      } catch (err) {
        this.showToast(`❌ Error updating ${section}: ${err.message}`, true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });
  },

  async patchSection(section, partial) {
    const res = await fetch(`/api/config/${section}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update configuration section');
    }
    return data.updated;
  },

  showToast(message, isError = false) {
    let toast = document.getElementById('syslab-dynamic-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'syslab-dynamic-toast';
      toast.style.position = 'fixed';
      toast.style.bottom = '24px';
      toast.style.right = '24px';
      toast.style.padding = '12px 20px';
      toast.style.borderRadius = '8px';
      toast.style.fontSize = '13px';
      toast.style.fontWeight = '600';
      toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5)';
      toast.style.zIndex = '99999';
      toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      document.body.appendChild(toast);
    }

    toast.style.background = isError ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)';
    toast.style.color = '#fff';
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
    }, 3200);
  }
};

window.DynamicConfigClient = DynamicConfigClient;
