/**
 * Client Module 6: Object Storage Service (S3-Lite)
 * Demonstrates chunking, SHA-256 Content-Addressable Storage, replication (RF=2), and node failover.
 */

const ObjectStorageClient = {
  pollingTimer: null,

  init() {
    this.setupEventListeners();
    this.refreshCluster();
    this.refreshFiles();
    this.pollingTimer = setInterval(() => {
      this.refreshCluster();
    }, 2000);
  },

  async refreshCluster() {
    try {
      const res = await fetch('/api/storage/cluster');
      const cluster = await res.json();
      this.renderNodes(cluster.nodes);
      this.updateTelemetry(cluster.metrics);
    } catch (e) {
      console.error('Error fetching cluster status:', e);
    }
  },

  async refreshFiles() {
    try {
      const res = await fetch('/api/storage/files');
      const data = await res.json();
      this.renderFiles(data.files || []);
    } catch (e) {
      console.error('Error fetching files:', e);
    }
  },

  renderNodes(nodes) {
    const grid = document.getElementById('storage-nodes-grid');
    if (!grid || !nodes) return;

    let html = '';
    for (const [nodeId, info] of Object.entries(nodes)) {
      const isOnline = info.online;
      const nodeName = nodeId.replace('_', ' ').toUpperCase();

      html += `
        <div class="storage-node-card ${isOnline ? '' : 'offline'}">
          <div class="node-header">
            <span class="node-name">${nodeName}</span>
            <span class="node-badge ${isOnline ? 'online' : 'offline'}">
              ${isOnline ? 'ONLINE' : 'CRASHED / OFFLINE'}
            </span>
          </div>

          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:0.75rem;">
            Stored Chunks: <strong style="color:#fff;">${info.chunkCount}</strong>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; font-family:var(--font-mono); color:var(--text-muted);">
              Fault Simulation:
            </span>
            <button class="btn ${isOnline ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="ObjectStorageClient.toggleNode('${nodeId}', ${!isOnline})">
              ${isOnline ? '⚡ Simulate Crash' : '🔄 Recover Node'}
            </button>
          </div>
        </div>
      `;
    }
    grid.innerHTML = html;
  },

  renderFiles(files) {
    const listEl = document.getElementById('storage-files-list');
    if (!listEl) return;

    if (files.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted); padding:1rem;">No files uploaded yet.</div>';
      return;
    }

    let html = '';
    files.forEach(file => {
      html += `
        <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.85rem; margin-bottom:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong style="color:#fff; font-size:13px;">${file.filename}</strong>
              <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:2px;">
                Size: ${file.size} bytes | Chunks: ${file.totalChunks} | ETag: ${file.etag.substring(0, 12)}...
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="ObjectStorageClient.inspectFile('${file.fileId}')">
              🔍 Read & Verify Failover
            </button>
          </div>

          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            ${file.chunks.map(c => `
              <span class="system-tag" style="font-size:9px;" title="Nodes: ${c.assignedNodes.join(', ')}">
                Chunk #${c.partIndex} -> [${c.assignedNodes.map(n => n.replace('node_', '').toUpperCase()).join(', ')}]
              </span>
            `).join('')}
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  },

  updateTelemetry(metrics) {
    const filesEl = document.getElementById('s3-files-count');
    const bytesEl = document.getElementById('s3-bytes-count');
    const chunksEl = document.getElementById('s3-chunks-count');
    const failoverEl = document.getElementById('s3-failovers-count');

    if (filesEl) filesEl.textContent = metrics.totalFilesStored || 0;
    if (bytesEl) bytesEl.textContent = (metrics.totalBytesStored / 1024).toFixed(1) + ' KB';
    if (chunksEl) chunksEl.textContent = metrics.totalChunksCreated || 0;
    if (failoverEl) failoverEl.textContent = metrics.failoverReadsHandled || 0;
  },

  async toggleNode(nodeId, online) {
    try {
      await fetch(`/api/storage/node/${nodeId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online })
      });
      this.refreshCluster();
    } catch (e) {
      console.error('Failed to toggle node:', e);
    }
  },

  async inspectFile(fileId) {
    const outputEl = document.getElementById('storage-read-output');
    if (outputEl) {
      outputEl.innerHTML = `<span style="color:var(--text-muted);">Fetching file chunks across cluster nodes...</span>`;
    }

    try {
      const res = await fetch(`/api/storage/file/${fileId}`);
      const data = await res.json();

      if (res.status === 200) {
        let chunksReportHtml = '';
        data.readReport.forEach(r => {
          const failoverBadge = r.hadFailover
            ? `<span style="color:var(--accent-warning); font-weight:bold;">⚠️ FAILOVER REPLICA SERVED!</span>`
            : `<span style="color:var(--accent-success);">PRIMARY NODE SERVED</span>`;

          chunksReportHtml += `
            <div style="font-family:var(--font-mono); font-size:11px; margin-bottom:4px;">
              Chunk #${r.partIndex}: Read from <strong>${r.servedByNode.toUpperCase()}</strong> - ${failoverBadge}
            </div>
          `;
        });

        outputEl.innerHTML = `
          <div style="background:rgba(0,0,0,0.5); padding:1rem; border-radius:6px; border:1px solid var(--border-color);">
            <div style="color:var(--accent-success); font-weight:700; margin-bottom:6px;">
              ✅ File Reconstructed Successfully (${data.metadata.filename})
            </div>
            ${chunksReportHtml}
            <div style="margin-top:10px; font-size:12px; color:var(--text-secondary);">
              <strong>Content Preview:</strong>
              <pre style="background:#090d16; padding:8px; border-radius:4px; margin-top:4px; font-size:11px; color:#cbd5e1; overflow-x:auto;">${data.contentPreview}</pre>
            </div>
          </div>
        `;
      } else {
        outputEl.innerHTML = `
          <div style="background:rgba(244,63,94,0.1); border:1px solid var(--accent-danger); padding:1rem; border-radius:6px;">
            <div style="color:var(--accent-danger); font-weight:700; margin-bottom:4px;">
              🛑 Read Failed: Quorum Loss!
            </div>
            <div style="font-size:12px; color:#fca5a5;">
              ${data.error}
            </div>
          </div>
        `;
      }
      this.refreshCluster();
    } catch (e) {
      if (outputEl) outputEl.textContent = 'Error: ' + e.message;
    }
  },

  async uploadFile() {
    const nameInput = document.getElementById('s3-upload-name');
    const contentInput = document.getElementById('s3-upload-content');
    const chunkSizeInput = document.getElementById('s3-chunk-size');

    const filename = nameInput ? nameInput.value.trim() : 'notes.txt';
    const content = contentInput ? contentInput.value : 'Hello distributed systems!';
    const chunkSize = chunkSizeInput ? Number(chunkSizeInput.value) : 64;

    if (!filename || !content) return;

    try {
      const res = await fetch('/api/storage/upload-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content, chunkSize })
      });
      const data = await res.json();

      this.refreshCluster();
      this.refreshFiles();

      const outEl = document.getElementById('storage-read-output');
      if (outEl) {
        outEl.innerHTML = `
          <div style="color:var(--accent-success); font-size:12px; font-family:var(--font-mono);">
            ✅ Stored "${data.filename}" (${data.size} bytes) partitioned into ${data.totalChunks} chunks with Replication Factor 2.
          </div>
        `;
      }
    } catch (e) {
      console.error('Upload failed:', e);
    }
  },

  setupEventListeners() {
    const uploadBtn = document.getElementById('s3-upload-btn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => this.uploadFile());
    }
  }
};
