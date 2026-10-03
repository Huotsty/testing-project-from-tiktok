/**
 * SysLab Master Application Coordinator
 * Manages tabs, system-wide telemetry, and initializes child modules
 */

const App = {
  activeTab: 'tab-overview',

  init() {
    this.setupTabs();
    this.pollSystemOverview();
    setInterval(() => this.pollSystemOverview(), 3000);

    // Initialize all module clients
    WhiteboardClient.init();
    FeatureFlagsClient.init();
    PostSchedulerClient.init();
    RateLimiterClient.init();
    ActivityFeedClient.init();
    ObjectStorageClient.init();
    FlociCloudClient.init();
    DynamicConfigClient.init();

    // Initialize unified pipeline runner and scale calculator
    this.setupUnifiedPipelineRunner();
    this.setupScaleCalculator();
  },

  setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTabId = btn.dataset.tab;
        this.switchTab(targetTabId);
      });
    });
  },

  switchTab(tabId) {
    this.activeTab = tabId;

    // Update tab button states
    document.querySelectorAll('.tab-btn').forEach(b => {
      if (b.dataset.tab === tabId) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(p => {
      if (p.id === tabId) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });

    // If switching to whiteboard, trigger canvas resize to ensure crisp resolution
    if (tabId === 'tab-whiteboard') {
      setTimeout(() => WhiteboardClient.resizeCanvas(), 50);
    }
  },

  async pollSystemOverview() {
    try {
      const res = await fetch('/api/system/overview');
      const data = await res.json();

      const uptimeEl = document.getElementById('global-uptime');
      if (uptimeEl) {
        const sec = Math.floor(data.uptime);
        uptimeEl.textContent = `${Math.floor(sec / 60)}m ${sec % 60}s`;
      }

      // Update overview summary metrics
      const ovWbEl = document.getElementById('ov-wb-deltas');
      const ovFlagsEl = document.getElementById('ov-flags-count');
      const ovSchedEl = document.getElementById('ov-sched-jobs');
      const ovRateEl = document.getElementById('ov-rate-reqs');
      const ovFeedEl = document.getElementById('ov-feed-events');
      const ovS3El = document.getElementById('ov-s3-chunks');

      if (ovWbEl && data.modules.whiteboard) ovWbEl.textContent = data.modules.whiteboard.totalDeltasProcessed;
      if (ovFlagsEl && data.modules.featureFlags) ovFlagsEl.textContent = data.modules.featureFlags.flagsCount;
      if (ovSchedEl && data.modules.postScheduler) ovSchedEl.textContent = data.modules.postScheduler.totalScheduled;
      if (ovRateEl && data.modules.rateLimiter) ovRateEl.textContent = data.modules.rateLimiter.totalRequests;
      if (ovFeedEl && data.modules.activityFeed) ovFeedEl.textContent = data.modules.activityFeed.totalEventsIngested;
      if (ovS3El && data.modules.objectStorage) ovS3El.textContent = data.modules.objectStorage.metrics.totalChunksCreated;
    } catch (e) {
      console.warn('Overview polling error:', e);
    }
  },

  setupUnifiedPipelineRunner() {
    const btn = document.getElementById('btn-run-unified-pipeline');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const outputEl = document.getElementById('unified-pipeline-output');
      if (outputEl) {
        outputEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; color:var(--accent-secondary); font-family:var(--font-mono); font-size:12px;">
            <span class="pulse-dot"></span>
            <span>Orchestrating End-to-End Pipeline across all 6 distributed systems...</span>
          </div>
        `;
      }

      try {
        const res = await fetch('/api/system/run-unified-pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientKey: 'architect-vip',
            tier: 'pro'
          })
        });

        const data = await res.json();

        if (outputEl && data.steps) {
          let stepsHtml = '';
          data.steps.forEach(step => {
            const badgeColor = step.status === 'PASSED' || step.status === 'ACTIVE' || step.status === 'SYNCED' || step.status === 'STORED & REPLICATED' || step.status === 'QUEUED' || step.status === 'FAN_OUT_COMPLETE'
              ? 'var(--accent-success)'
              : 'var(--accent-warning)';

            stepsHtml += `
              <div style="display:flex; align-items:flex-start; gap:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-family:var(--font-mono); font-size:12px;">
                <span style="background:rgba(99,102,241,0.2); color:#a5b4fc; padding:2px 8px; border-radius:4px; font-weight:700;">
                  Step ${step.stepNumber}
                </span>
                <div style="flex:1;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:#fff;">${step.name}</strong>
                    <span style="color:${badgeColor}; font-weight:bold; font-size:11px;">[${step.status}] (~${step.durationMs}ms)</span>
                  </div>
                  <div style="color:var(--text-secondary); font-size:11px; margin-top:2px;">
                    ${step.details}
                  </div>
                </div>
              </div>
            `;
          });

          outputEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border-color);">
              <span style="color:var(--accent-success); font-weight:700; font-size:13px;">
                ✅ End-to-End Pipeline Completed (${data.totalDurationMs}ms total)
              </span>
              <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">
                Pipeline Trace ID: ${data.pipelineId}
              </span>
            </div>
            <div>${stepsHtml}</div>
            <div style="margin-top:10px; font-size:11px; color:var(--accent-secondary); font-family:var(--font-mono);">
              💡 ${data.summary}
            </div>
          `;
        }

        // Trigger refreshes on whiteboard, storage, feed, and flags
        WhiteboardClient.startMetricsPolling();
        ObjectStorageClient.refreshCluster();
        ObjectStorageClient.refreshFiles();
        ActivityFeedClient.loadFeed(true);
        PostSchedulerClient.refreshJobs();
      } catch (err) {
        if (outputEl) {
          outputEl.innerHTML = `<div style="color:var(--accent-danger);">Pipeline Error: ${err.message}</div>`;
        }
      }
    });
  },

  setupScaleCalculator() {
    const dauInput = document.getElementById('calc-dau');
    const actionsInput = document.getElementById('calc-actions');
    const ratioInput = document.getElementById('calc-ratio');
    const payloadInput = document.getElementById('calc-payload');

    if (!dauInput) return;

    const recalculate = () => {
      const dau = Number(dauInput.value) || 10000000;
      const actions = Number(actionsInput.value) || 10;
      const readRatio = Number(ratioInput.value) || 10;
      const payloadKb = Number(payloadInput.value) || 2;

      const totalRequestsPerDay = dau * actions;
      const totalSecondsPerDay = 86400;

      // Write requests = total / (1 + readRatio)
      const writesPerDay = totalRequestsPerDay / (1 + readRatio);
      const writeQps = Math.round(writesPerDay / totalSecondsPerDay);
      const peakWriteQps = writeQps * 2;

      // Bandwidth Ingress = writeQps * payloadKb (in KB/s)
      const ingressBwKbs = writeQps * payloadKb;
      const ingressBwMbs = (ingressBwKbs / 1024).toFixed(2);
      const dailyIngressGb = Math.round((writesPerDay * payloadKb) / (1024 * 1024));

      // Cache memory (20% of daily active writes)
      const cacheRamGb = Math.round(dailyIngressGb * 0.2);

      const writeQpsEl = document.getElementById('res-write-qps');
      const peakQpsEl = document.getElementById('res-peak-qps');
      const ingressBwEl = document.getElementById('res-ingress-bw');
      const dailyIngressEl = document.getElementById('res-daily-ingress');
      const cacheSizeEl = document.getElementById('res-cache-size');

      if (writeQpsEl) writeQpsEl.textContent = `${writeQps.toLocaleString()} / sec`;
      if (peakQpsEl) peakQpsEl.textContent = `${peakWriteQps.toLocaleString()} / sec`;
      if (ingressBwEl) ingressBwEl.textContent = `${ingressBwMbs} MB/s`;
      if (dailyIngressEl) dailyIngressEl.textContent = `${dailyIngressGb} GB / day`;
      if (cacheSizeEl) cacheSizeEl.textContent = `${cacheRamGb} GB RAM`;
    };

    [dauInput, actionsInput, ratioInput, payloadInput].forEach(inp => {
      inp.addEventListener('input', recalculate);
      inp.addEventListener('change', recalculate);
    });

    recalculate();
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
