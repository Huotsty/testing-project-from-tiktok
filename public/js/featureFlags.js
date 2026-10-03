/**
 * Client Module 2: Feature Flag Service (SDK & Control Panel)
 * Demonstrates local in-memory evaluation (<0.1ms) and SSE push updates
 */

const FeatureFlagsClient = {
  localFlagsCache: new Map(),
  version: 0,
  eventSource: null,

  init() {
    this.setupSseStream();
    this.setupEventListeners();
  },

  setupSseStream() {
    this.eventSource = new EventSource('/api/flags/stream');

    this.eventSource.onopen = () => {
      console.log('📡 SSE Feature Flag Stream Connected');
      const pill = document.getElementById('flags-sse-status');
      if (pill) {
        pill.textContent = 'SSE LIVE STREAMING';
        pill.className = 'system-status-pill';
      }
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleStreamMessage(data);
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    this.eventSource.onerror = () => {
      const pill = document.getElementById('flags-sse-status');
      if (pill) {
        pill.textContent = 'STREAM RECONNECTING...';
        pill.className = 'btn-danger btn-sm';
      }
    };
  },

  handleStreamMessage(data) {
    if (data.type === 'initial_config') {
      this.version = data.version;
      this.localFlagsCache.clear();
      data.flags.forEach(f => this.localFlagsCache.set(f.key, f));
      this.renderFlagsList();
      this.logSseEvent(`[INITIAL HYDRATE] Loaded ${data.flags.length} flags at v${data.version} into local memory`);
    } else if (data.type === 'flag_updated') {
      this.localFlagsCache.set(data.flag.key, data.flag);
      this.version = data.flag.version;
      this.renderFlagsList();
      this.logSseEvent(`[SSE PUSH] Flag '${data.flag.key}' updated -> Enabled: ${data.flag.enabled}, Rollout: ${data.flag.rolloutPercentage}%`);
    } else if (data.type === 'flag_deleted') {
      this.localFlagsCache.delete(data.key);
      this.renderFlagsList();
      this.logSseEvent(`[SSE PUSH] Flag '${data.key}' deleted (v${data.version})`);
    }
  },

  renderFlagsList() {
    const container = document.getElementById('flags-list-container');
    if (!container) return;

    if (this.localFlagsCache.size === 0) {
      container.innerHTML = '<div style="color:var(--text-muted); padding:1rem;">No feature flags defined.</div>';
      return;
    }

    let html = '';
    for (const flag of this.localFlagsCache.values()) {
      html += `
        <div class="flag-row">
          <div class="flag-info">
            <h4>
              ${flag.name}
              <span class="system-tag">${flag.rolloutPercentage}% ROLLOUT</span>
            </h4>
            <div class="flag-key">key: ${flag.key}</div>
            <div class="flag-desc">${flag.description || 'No description'}</div>
          </div>
          <div style="display:flex; align-items:center; gap: 1.25rem;">
            <div style="display:flex; flex-direction:column; align-items:flex-end;">
              <label class="switch">
                <input type="checkbox" ${flag.enabled ? 'checked' : ''} onchange="FeatureFlagsClient.toggleFlag('${flag.key}')">
                <span class="slider"></span>
              </label>
              <span style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                ${flag.enabled ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;

    const versionBadge = document.getElementById('flags-version-badge');
    if (versionBadge) versionBadge.textContent = `Config v${this.version}`;
  },

  async toggleFlag(key) {
    try {
      await fetch(`/api/flags/${key}/toggle`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to toggle flag:', e);
    }
  },

  async updateRollout(key, percentage) {
    try {
      await fetch(`/api/flags/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolloutPercentage: Number(percentage) })
      });
    } catch (e) {
      console.error('Failed to update rollout:', e);
    }
  },

  /**
   * Fast In-Memory Local Evaluation (SDK simulation)
   */
  evaluateLocally(key, userId) {
    const t0 = performance.now();
    const flag = this.localFlagsCache.get(key);

    if (!flag) {
      return { enabled: false, reason: 'FLAG_NOT_FOUND', durationMs: (performance.now() - t0).toFixed(3) };
    }
    if (!flag.enabled) {
      return { enabled: false, reason: 'FLAG_DISABLED', durationMs: (performance.now() - t0).toFixed(3) };
    }
    if (flag.targetUsers && flag.targetUsers.includes(userId)) {
      return { enabled: true, reason: 'USER_TARGETED_WHITELIST', durationMs: (performance.now() - t0).toFixed(3) };
    }
    if (flag.rolloutPercentage >= 100) {
      return { enabled: true, reason: 'FULL_100%_ROLLOUT', durationMs: (performance.now() - t0).toFixed(3) };
    }
    if (flag.rolloutPercentage <= 0) {
      return { enabled: false, reason: 'ZERO_0%_ROLLOUT', durationMs: (performance.now() - t0).toFixed(3) };
    }

    // Deterministic simple hash for client-side demo
    let hash = 0;
    const str = `${userId}:${key}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const bucket = Math.abs(hash) % 100;
    const enabled = bucket < flag.rolloutPercentage;
    const durationMs = (performance.now() - t0).toFixed(3);

    return {
      enabled,
      bucket,
      rolloutPercentage: flag.rolloutPercentage,
      reason: enabled ? `BUCKET_${bucket}_IN_RANGE` : `BUCKET_${bucket}_EXCLUDED`,
      durationMs
    };
  },

  setupEventListeners() {
    const evalBtn = document.getElementById('flags-eval-test-btn');
    if (evalBtn) {
      evalBtn.addEventListener('click', () => {
        const key = document.getElementById('flags-eval-key').value;
        const userId = document.getElementById('flags-eval-user').value || 'user_123';
        const result = this.evaluateLocally(key, userId);

        const out = document.getElementById('flags-eval-result');
        if (out) {
          out.innerHTML = `
            <div style="font-family:var(--font-mono); font-size:12px; color: ${result.enabled ? 'var(--accent-success)' : 'var(--accent-danger)'}">
              Status: <strong>${result.enabled ? 'ENABLED (TRUE)' : 'DISABLED (FALSE)'}</strong><br>
              Reason: ${result.reason}<br>
              Evaluation Latency: <strong>${result.durationMs} ms</strong> (Local in-memory read, 0 network hops)
            </div>
          `;
        }
      });
    }

    const createForm = document.getElementById('create-flag-form');
    if (createForm) {
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = document.getElementById('new-flag-key').value.trim();
        const name = document.getElementById('new-flag-name').value.trim();
        const rollout = Number(document.getElementById('new-flag-rollout').value);

        if (!key) return;

        await fetch('/api/flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, name, rolloutPercentage: rollout, enabled: true })
        });

        document.getElementById('new-flag-key').value = '';
        document.getElementById('new-flag-name').value = '';
      });
    }
  },

  logSseEvent(msg) {
    const terminal = document.getElementById('flags-sse-log');
    if (!terminal) return;

    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `
      <span class="log-time">${new Date().toLocaleTimeString()}</span>
      <span class="log-text success">${msg}</span>
    `;
    terminal.prepend(row);
    if (terminal.children.length > 25) terminal.lastElementChild.remove();
  }
};
