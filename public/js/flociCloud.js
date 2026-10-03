/**
 * Module 8: Floci Local Cloud Integration Client
 * Provides interactive controls to test S3, SQS, and DynamoDB emulation live!
 */

const FlociCloudClient = {
  endpoint: 'http://localhost:4566',
  uiUrl: 'http://localhost:4500',
  currentBucket: 'syslab-cloud-bucket',
  currentQueue: 'syslab-posts-queue',
  currentTable: 'SysLabFlags',

  init() {
    this.refreshStatus();
    setInterval(() => this.refreshStatus(), 5000);
    this.bindEvents();
    this.loadS3Objects();
    this.loadQueues();
  },

  bindEvents() {
    // S3 actions
    const syncS3Btn = document.getElementById('floci-sync-s3-btn');
    if (syncS3Btn) {
      syncS3Btn.addEventListener('click', () => this.syncS3());
    }

    const uploadS3Btn = document.getElementById('floci-upload-s3-btn');
    if (uploadS3Btn) {
      uploadS3Btn.addEventListener('click', () => this.uploadCustomS3());
    }

    // SQS actions
    const bridgeSqsBtn = document.getElementById('floci-bridge-sqs-btn');
    if (bridgeSqsBtn) {
      bridgeSqsBtn.addEventListener('click', () => this.bridgeSQS());
    }

    const sendSqsBtn = document.getElementById('floci-send-sqs-btn');
    if (sendSqsBtn) {
      sendSqsBtn.addEventListener('click', () => this.sendCustomSQS());
    }

    const pollSqsBtn = document.getElementById('floci-poll-sqs-btn');
    if (pollSqsBtn) {
      pollSqsBtn.addEventListener('click', () => this.pollSQS());
    }

    // DynamoDB actions
    const syncDynamoBtn = document.getElementById('floci-sync-dynamo-btn');
    if (syncDynamoBtn) {
      syncDynamoBtn.addEventListener('click', () => this.syncDynamoDB());
    }

    const scanDynamoBtn = document.getElementById('floci-scan-dynamo-btn');
    if (scanDynamoBtn) {
      scanDynamoBtn.addEventListener('click', () => this.scanDynamoDB());
    }
  },

  async refreshStatus() {
    try {
      const res = await fetch('/api/floci/status');
      const data = await res.json();
      
      const badge = document.getElementById('floci-status-badge');
      const countEl = document.getElementById('floci-service-count');
      const servicesEl = document.getElementById('floci-services-list');
      const consoleLink = document.getElementById('floci-console-link');

      if (data.connected) {
        if (badge) {
          badge.className = 'system-tag';
          badge.style.background = 'rgba(16, 185, 129, 0.2)';
          badge.style.color = '#10b981';
          badge.style.border = '1px solid #10b981';
          badge.textContent = '● FLOCI CLOUD ONLINE';
        }
        if (countEl) countEl.textContent = `${data.totalRunningServices} Services Emulated`;
        if (servicesEl && data.services) {
          servicesEl.innerHTML = data.services.map(s => `<span class="tag" style="background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px; font-size:11px; margin:2px;">${s}</span>`).join(' ');
        }
        if (consoleLink) {
          consoleLink.href = data.uiEndpoint || 'http://localhost:4500';
          consoleLink.style.display = 'inline-flex';
        }
      } else {
        if (badge) {
          badge.className = 'system-tag';
          badge.style.background = 'rgba(239, 68, 68, 0.2)';
          badge.style.color = '#ef4444';
          badge.style.border = '1px solid #ef4444';
          badge.textContent = '○ FLOCI OFFLINE';
        }
        if (countEl) countEl.textContent = '0 Services';
      }
    } catch (_) {}
  },

  async syncS3() {
    this.logConsole(`[S3] Triggering full sync of SysLab chunked files to bucket '${this.currentBucket}'...`);
    try {
      const res = await fetch('/api/floci/s3/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: this.currentBucket })
      });
      const data = await res.json();
      if (data.success) {
        this.logConsole(`[S3 SUCCESS] Replicated ${data.syncedCount} files into local S3 bucket '${this.currentBucket}'!`);
        this.loadS3Objects();
      } else {
        this.logConsole(`[S3 ERROR] ${data.error}`);
      }
    } catch (err) {
      this.logConsole(`[S3 ERROR] ${err.message}`);
    }
  },

  async uploadCustomS3() {
    const filenameInput = document.getElementById('floci-s3-file-name');
    const contentInput = document.getElementById('floci-s3-file-content');
    const filename = (filenameInput && filenameInput.value.trim()) || `note-${Date.now()}.txt`;
    const content = (contentInput && contentInput.value.trim()) || 'Hello from SysLab interactive workbench to Floci local cloud!';

    this.logConsole(`[S3] Uploading file '${filename}' to S3 bucket '${this.currentBucket}'...`);
    try {
      const res = await fetch('/api/floci/s3/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: this.currentBucket, filename, content })
      });
      const data = await res.json();
      if (data.success) {
        this.logConsole(`[S3 SUCCESS] Object '${data.key}' stored with status ${data.status}!`);
        this.loadS3Objects();
      }
    } catch (err) {
      this.logConsole(`[S3 ERROR] ${err.message}`);
    }
  },

  async loadS3Objects() {
    try {
      const res = await fetch(`/api/floci/s3/list?bucket=${this.currentBucket}`);
      const data = await res.json();
      const listEl = document.getElementById('floci-s3-objects-list');
      if (!listEl) return;

      if (!data.objects || data.objects.length === 0) {
        listEl.innerHTML = `<div style="color:var(--text-secondary); font-size:12px; padding:10px;">Bucket is empty. Click "Sync SysLab Storage" or upload an object.</div>`;
        return;
      }

      listEl.innerHTML = data.objects.map(obj => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:6px; margin-bottom:6px; font-family:var(--font-mono); font-size:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:#10b981;">📄</span>
            <span style="color:var(--text-primary);">${obj.key}</span>
          </div>
          <div style="color:var(--text-secondary); font-size:11px;">${obj.size} bytes</div>
        </div>
      `).join('');
    } catch (_) {}
  },

  async bridgeSQS() {
    this.logConsole(`[SQS] Bridging SysLab Post Scheduler queued jobs to SQS queue '${this.currentQueue}'...`);
    try {
      const res = await fetch('/api/floci/sqs/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueName: this.currentQueue })
      });
      const data = await res.json();
      if (data.success) {
        this.logConsole(`[SQS SUCCESS] Enqueued ${data.publishedCount} scheduled posts into '${data.queueUrl}'!`);
      }
    } catch (err) {
      this.logConsole(`[SQS ERROR] ${err.message}`);
    }
  },

  async sendCustomSQS() {
    const input = document.getElementById('floci-sqs-message-input');
    const msg = (input && input.value.trim()) || `Job Event ${Date.now()}: Process analytics stream`;
    const queueUrl = `${this.endpoint}/000000000000/${this.currentQueue}`;

    this.logConsole(`[SQS] Sending message to queue: "${msg}"...`);
    try {
      const res = await fetch('/api/floci/sqs/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueUrl, message: msg })
      });
      const data = await res.json();
      if (data.success) {
        this.logConsole(`[SQS SUCCESS] Message dispatched! ID: ${data.messageId} (MD5: ${data.md5})`);
        if (input) input.value = '';
      }
    } catch (err) {
      this.logConsole(`[SQS ERROR] ${err.message}`);
    }
  },

  async pollSQS() {
    const queueUrl = `${this.endpoint}/000000000000/${this.currentQueue}`;
    this.logConsole(`[SQS] Polling up to 5 messages from '${this.currentQueue}'...`);
    try {
      const res = await fetch(`/api/floci/sqs/receive?queueUrl=${encodeURIComponent(queueUrl)}`);
      const data = await res.json();
      if (data.success) {
        if (!data.messages || data.messages.length === 0) {
          this.logConsole(`[SQS] Queue is empty (0 messages received).`);
        } else {
          this.logConsole(`[SQS RECEIVED] Consumed ${data.messages.length} message(s):`);
          data.messages.forEach(m => {
            const bodyStr = typeof m.body === 'object' ? JSON.stringify(m.body) : m.body;
            this.logConsole(`  ↳ [ID: ${m.id}] ${bodyStr}`);
          });
        }
      }
    } catch (err) {
      this.logConsole(`[SQS ERROR] ${err.message}`);
    }
  },

  async loadQueues() {
    try {
      const res = await fetch('/api/floci/sqs/list');
      const data = await res.json();
      const queuesEl = document.getElementById('floci-queues-list');
      if (!queuesEl) return;
      if (data.queues && data.queues.length > 0) {
        queuesEl.innerHTML = data.queues.map(q => `<div style="font-family:var(--font-mono); font-size:11px; color:#10b981; padding:2px 0;">${q}</div>`).join('');
      }
    } catch (_) {}
  },

  async syncDynamoDB() {
    this.logConsole(`[DYNAMODB] Exporting active Feature Flags into DynamoDB table '${this.currentTable}'...`);
    try {
      const res = await fetch('/api/floci/dynamodb/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: this.currentTable })
      });
      const data = await res.json();
      if (data.success) {
        this.logConsole(`[DYNAMODB SUCCESS] Persisted ${data.syncedFlags.length} feature flags into DynamoDB '${this.currentTable}'!`);
        this.scanDynamoDB();
      }
    } catch (err) {
      this.logConsole(`[DYNAMODB ERROR] ${err.message}`);
    }
  },

  async scanDynamoDB() {
    this.logConsole(`[DYNAMODB] Executing Scan on table '${this.currentTable}'...`);
    try {
      const res = await fetch(`/api/floci/dynamodb/scan?tableName=${this.currentTable}`);
      const data = await res.json();
      const listEl = document.getElementById('floci-dynamo-items-list');
      if (!listEl) return;

      if (!data.items || data.items.length === 0) {
        listEl.innerHTML = `<div style="color:var(--text-secondary); font-size:12px; padding:10px;">Table is empty. Click "Sync Feature Flags to DynamoDB".</div>`;
        return;
      }

      this.logConsole(`[DYNAMODB] Scan retrieved ${data.items.length} items from '${this.currentTable}'.`);
      listEl.innerHTML = data.items.map(item => `
        <div style="padding:8px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:6px; margin-bottom:6px; font-family:var(--font-mono); font-size:12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <strong style="color:var(--accent-primary);">${item.id}</strong>
            <span class="system-tag" style="font-size:10px; ${item.enabled ? 'background:rgba(16,185,129,0.2); color:#10b981;' : 'background:rgba(239,68,68,0.2); color:#ef4444;'}">
              ${item.enabled ? 'ENABLED' : 'DISABLED'} (${item.percentage}%)
            </span>
          </div>
          <div style="color:var(--text-secondary); font-size:11px;">Name: ${item.name} | Updated: ${item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString() : 'N/A'}</div>
        </div>
      `).join('');
    } catch (err) {
      this.logConsole(`[DYNAMODB ERROR] ${err.message}`);
    }
  },

  logConsole(msg) {
    const consoleEl = document.getElementById('floci-live-console');
    if (!consoleEl) return;
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.style.padding = '3px 0';
    line.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
    line.innerHTML = `<span style="color:var(--text-secondary); font-size:11px;">[${time}]</span> <span style="color:#f8fafc;">${msg}</span>`;
    consoleEl.prepend(line);
  }
};
