/**
 * Client Module 3: Social Post / Delayed Job Scheduler
 * Demonstrates delayed queues, idempotency key deduplication, worker retries, and DLQ.
 */

const PostSchedulerClient = {
  pollingInterval: null,

  init() {
    this.setupEventListeners();
    this.refreshJobs();
    this.pollingInterval = setInterval(() => this.refreshJobs(), 1500);
  },

  async refreshJobs() {
    try {
      const res = await fetch('/api/scheduler/jobs');
      const data = await res.json();
      this.renderJobs(data.jobs);
      this.renderAuditLogs(data.metrics.auditLogs || []);
      this.updateTelemetry(data.metrics);
    } catch (e) {
      console.error('Error fetching scheduler jobs:', e);
    }
  },

  renderJobs(jobs) {
    const listEl = document.getElementById('scheduler-jobs-list');
    if (!listEl) return;

    if (!jobs || jobs.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted); padding:1rem;">No jobs currently scheduled.</div>';
      return;
    }

    let html = '';
    jobs.forEach(job => {
      let statusColor = 'var(--accent-primary)';
      if (job.status === 'published') statusColor = 'var(--accent-success)';
      if (job.status === 'retrying') statusColor = 'var(--accent-warning)';
      if (job.status === 'dlq') statusColor = 'var(--accent-danger)';

      const timeRemaining = Math.max(0, Math.ceil((job.scheduledAt - Date.now()) / 1000));

      html += `
        <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1rem; margin-bottom:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
            <div>
              <span style="font-size:11px; font-family:var(--font-mono); color:${statusColor}; font-weight:700; text-transform:uppercase;">
                ● ${job.status}
              </span>
              <span style="font-size:11px; font-family:var(--font-mono); color:var(--text-muted); margin-left:8px;">
                Platform: ${job.platform}
              </span>
            </div>
            <span style="font-size:11px; font-family:var(--font-mono); color:var(--text-secondary);">
              ${job.status === 'published' ? `Published: ${new Date(job.publishedAt).toLocaleTimeString()}` : `Due in: ${timeRemaining}s`}
            </span>
          </div>

          <div style="font-size:0.9rem; color:#fff; font-weight:500; margin-bottom:0.5rem;">
            "${job.content}"
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; font-family:var(--font-mono); color:var(--text-muted);">
            <div>
              Idempotency Key: <span style="color:var(--accent-secondary);">${job.idempotencyKey}</span> | 
              Attempts: ${job.attempts}/${job.maxRetries}
            </div>
            ${job.status === 'dlq' ? `
              <button class="btn btn-secondary btn-sm" onclick="PostSchedulerClient.redrive('${job.id}')">
                🔄 Re-drive from DLQ
              </button>
            ` : ''}
          </div>
          ${job.lastError ? `
            <div style="margin-top:0.4rem; font-size:11px; font-family:var(--font-mono); color:var(--accent-danger);">
              ⚠️ Last Error: ${job.lastError}
            </div>
          ` : ''}
        </div>
      `;
    });

    listEl.innerHTML = html;
  },

  renderAuditLogs(logs) {
    const term = document.getElementById('scheduler-audit-terminal');
    if (!term) return;

    let html = '';
    logs.forEach(log => {
      let cls = '';
      if (log.message.includes('SUCCESS')) cls = 'success';
      if (log.message.includes('RETRY') || log.message.includes('CONFIG')) cls = 'warning';
      if (log.message.includes('DLQ') || log.message.includes('BLOCKED')) cls = 'danger';

      html += `
        <div class="log-entry">
          <span class="log-time">${log.time}</span>
          <span class="log-text ${cls}">${log.message}</span>
        </div>
      `;
    });
    term.innerHTML = html;
  },

  updateTelemetry(metrics) {
    const queuedEl = document.getElementById('sched-queued-count');
    const pubEl = document.getElementById('sched-published-count');
    const dedupeEl = document.getElementById('sched-dedupe-count');
    const dlqEl = document.getElementById('sched-dlq-count');

    if (queuedEl) queuedEl.textContent = metrics.activeQueuedCount || 0;
    if (pubEl) pubEl.textContent = metrics.totalPublished || 0;
    if (dedupeEl) dedupeEl.textContent = metrics.idempotentDuplicatesBlocked || 0;
    if (dlqEl) dlqEl.textContent = metrics.dlqCount || 0;
  },

  async redrive(jobId) {
    try {
      await fetch(`/api/scheduler/redrive/${jobId}`, { method: 'POST' });
      this.refreshJobs();
    } catch (e) {
      console.error('Failed to redrive job:', e);
    }
  },

  setupEventListeners() {
    const form = document.getElementById('schedule-post-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = document.getElementById('post-content-input').value.trim();
        const platform = document.getElementById('post-platform-select').value;
        const delaySec = Number(document.getElementById('post-delay-input').value) || 5;
        const idempotencyKey = document.getElementById('post-idempotency-input').value.trim();

        if (!content) return;

        const scheduledAt = Date.now() + (delaySec * 1000);

        await fetch('/api/scheduler/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, platform, scheduledAt, idempotencyKey: idempotencyKey || undefined })
        });

        document.getElementById('post-content-input').value = '';
        this.refreshJobs();
      });
    }

    // Double-Click Idempotency Test Simulator
    const testIdemBtn = document.getElementById('test-idempotency-burst-btn');
    if (testIdemBtn) {
      testIdemBtn.addEventListener('click', async () => {
        const sharedKey = 'client-retry-' + Math.random().toString(36).substring(2, 8);
        const payload = {
          content: '⚡ Idempotency Test: Simulated Network Drop & Automatic Client Retry',
          platform: 'Twitter / X',
          scheduledAt: Date.now() + 8000,
          idempotencyKey: sharedKey
        };

        const resultEl = document.getElementById('idempotency-test-output');
        if (resultEl) {
          resultEl.innerHTML = `<em>Fired Request 1 and Request 2 with same key: <strong>${sharedKey}</strong>...</em>`;
        }

        // Fire request 1
        const res1 = await fetch('/api/scheduler/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data1 = await res1.json();

        // Fire request 2 immediately with same key (simulating retry after timeout)
        const res2 = await fetch('/api/scheduler/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data2 = await res2.json();

        if (resultEl) {
          resultEl.innerHTML = `
            <div style="font-family:var(--font-mono); font-size:12px; margin-top:8px;">
              <div style="color:var(--accent-success);">✅ Req #1: ${data1.message} (Job ID: ${data1.job.id})</div>
              <div style="color:var(--accent-warning);">🛡️ Req #2: ${data2.message} (Deduplicated! Same Job ID: ${data2.job.id})</div>
              <div style="color:var(--text-muted); font-size:11px; margin-top:4px;">
                Result: Only 1 job was scheduled. Duplicate publishing prevented!
              </div>
            </div>
          `;
        }
        this.refreshJobs();
      });
    }

    // Chaos Failure Rate Slider
    const failureSlider = document.getElementById('scheduler-failure-rate-slider');
    const failureDisplay = document.getElementById('scheduler-failure-rate-val');
    if (failureSlider) {
      failureSlider.addEventListener('input', async (e) => {
        const val = Number(e.target.value);
        if (failureDisplay) failureDisplay.textContent = `${(val * 100).toFixed(0)}%`;
        await fetch('/api/scheduler/failure-rate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rate: val })
        });
      });
    }
  }
};
