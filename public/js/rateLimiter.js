/**
 * Client Module 4: API Rate Limiter Gateway
 * Controls Token Bucket and Sliding Window algorithms, animates tokens, tests OpenAI endpoint
 */

const RateLimiterClient = {
  currentTier: 'free',
  clientKey: 'architect-user-01',
  pollingTimer: null,

  init() {
    this.setupEventListeners();
    this.pollState();
    this.pollingTimer = setInterval(() => this.pollState(), 800);
  },

  async pollState() {
    try {
      const res = await fetch(`/api/ratelimit/state?clientKey=${this.clientKey}&tier=${this.currentTier}`);
      const state = await res.json();
      this.updateVisualizers(state);

      const metricsRes = await fetch('/api/ratelimit/metrics');
      const metrics = await metricsRes.json();
      this.updateMetrics(metrics);
    } catch (e) {
      console.error('Error polling rate limit state:', e);
    }
  },

  updateVisualizers(state) {
    // 1. Update Token Bucket Visualizer
    const waterEl = document.getElementById('bucket-water-fill');
    const textEl = document.getElementById('bucket-tokens-display');
    const refillSubEl = document.getElementById('bucket-refill-rate');

    if (waterEl && state.tokenBucket) {
      waterEl.style.height = `${state.tokenBucket.fillPercent}%`;
      textEl.textContent = `${state.tokenBucket.currentTokens} / ${state.tokenBucket.capacity}`;
      if (refillSubEl) {
        refillSubEl.textContent = `Refills +${state.tokenBucket.refillPerSec} token/sec`;
      }
    }

    // 2. Update Sliding Window Visualizer
    const windowBar = document.getElementById('sliding-window-fill');
    const windowText = document.getElementById('sliding-window-display');
    if (windowBar && state.slidingWindow) {
      windowBar.style.width = `${state.slidingWindow.usagePercent}%`;
      windowText.textContent = `${state.slidingWindow.activeRequests} / ${state.slidingWindow.limit} requests (15s window)`;
    }
  },

  updateMetrics(metrics) {
    const totalEl = document.getElementById('rl-total-reqs');
    const allowedEl = document.getElementById('rl-allowed-reqs');
    const blockedEl = document.getElementById('rl-blocked-reqs');

    if (totalEl) totalEl.textContent = metrics.totalRequests || 0;
    if (allowedEl) allowedEl.textContent = metrics.allowedRequests || 0;
    if (blockedEl) blockedEl.textContent = metrics.blockedRequests || 0;

    // Render Request Logs
    const term = document.getElementById('ratelimit-trace-terminal');
    if (!term || !metrics.requestLog) return;

    let html = '';
    metrics.requestLog.forEach(log => {
      const cls = log.allowed ? 'success' : 'danger';
      const statusText = log.allowed ? '200 OK (ALLOWED)' : `429 TOO MANY REQUESTS (Retry-After: ${log.retryAfter}s)`;

      html += `
        <div class="log-entry">
          <span class="log-time">${log.time}</span>
          <span class="log-text ${cls}">[${log.algo.toUpperCase()}] ${statusText} - Remaining: ${log.remaining}/${log.limit}</span>
        </div>
      `;
    });
    term.innerHTML = html;
  },

  async sendRequest() {
    const promptInput = document.getElementById('openai-prompt-input');
    const promptText = promptInput ? promptInput.value : 'Explain CQRS pattern';
    const outputEl = document.getElementById('openai-response-output');

    if (outputEl) {
      outputEl.innerHTML = `<span style="color:var(--text-muted);">Calling OpenAI API via Rate Limiting Gateway...</span>`;
    }

    try {
      const res = await fetch('/api/openai/mock-completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.clientKey,
          'x-tier': this.currentTier
        },
        body: JSON.stringify({ prompt: promptText })
      });

      const data = await res.json();
      const limitHeader = res.headers.get('x-ratelimit-limit');
      const remainHeader = res.headers.get('x-ratelimit-remaining');
      const retryHeader = res.headers.get('retry-after');

      if (res.status === 200) {
        outputEl.innerHTML = `
          <div style="color:var(--accent-success); font-weight:700; margin-bottom:4px;">
            ✅ 200 OK (Prompt Answered)
          </div>
          <div style="color:#e2e8f0; font-size:13px; margin-bottom:8px;">
            "${data.reply}"
          </div>
          <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-secondary); background:rgba(0,0,0,0.4); padding:6px; border-radius:4px;">
            Headers: X-RateLimit-Limit: ${limitHeader || 5} | X-RateLimit-Remaining: ${remainHeader || data.rateLimitRemaining}
          </div>
        `;
      } else {
        outputEl.innerHTML = `
          <div style="color:var(--accent-danger); font-weight:700; margin-bottom:4px;">
            🛑 429 Too Many Requests (Rate Limited!)
          </div>
          <div style="color:#fca5a5; font-size:12px; margin-bottom:8px;">
            ${data.message}
          </div>
          <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-secondary); background:rgba(0,0,0,0.4); padding:6px; border-radius:4px;">
            Headers: Retry-After: ${retryHeader || 3}s | X-RateLimit-Remaining: 0
          </div>
        `;
      }
      this.pollState();
    } catch (e) {
      if (outputEl) outputEl.textContent = 'Network error: ' + e.message;
    }
  },

  async fireBurst(count = 8) {
    const outputEl = document.getElementById('openai-response-output');
    if (outputEl) {
      outputEl.innerHTML = `<span style="color:var(--accent-warning);">Firing burst of ${count} concurrent requests...</span>`;
    }

    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(
        fetch('/api/openai/mock-completion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.clientKey,
            'x-tier': this.currentTier
          },
          body: JSON.stringify({ prompt: `Burst request #${i + 1}` })
        }).then(r => ({ status: r.status, id: i + 1 }))
      );
    }

    const results = await Promise.all(promises);
    const passed = results.filter(r => r.status === 200).length;
    const blocked = results.filter(r => r.status === 429).length;

    if (outputEl) {
      outputEl.innerHTML = `
        <div style="font-size:13px; font-weight:700; margin-bottom:6px;">
          Burst Test Completed: ${count} requests
        </div>
        <div style="display:flex; gap:12px; font-family:var(--font-mono); font-size:12px;">
          <span style="color:var(--accent-success);">Allowed (200): ${passed}</span>
          <span style="color:var(--accent-danger);">Blocked (429): ${blocked}</span>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">
          Notice how the bucket capacity prevented server overload!
        </div>
      `;
    }
    this.pollState();
  },

  setupEventListeners() {
    const singleBtn = document.getElementById('rl-single-req-btn');
    if (singleBtn) singleBtn.addEventListener('click', () => this.sendRequest());

    const burstBtn = document.getElementById('rl-burst-req-btn');
    if (burstBtn) burstBtn.addEventListener('click', () => this.fireBurst(8));

    // Algorithm switcher
    const algoRadios = document.querySelectorAll('input[name="rl-algo"]');
    algoRadios.forEach(radio => {
      radio.addEventListener('change', async (e) => {
        await fetch('/api/ratelimit/algorithm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ algorithm: e.target.value })
        });
        this.pollState();
      });
    });

    // Tier switcher
    const tierRadios = document.querySelectorAll('input[name="rl-tier"]');
    tierRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.currentTier = e.target.value;
        this.pollState();
      });
    });
  }
};
