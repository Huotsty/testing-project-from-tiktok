/**
 * Client Module 1: Collaborative Whiteboard
 * Handles canvas drawing, delta-packet packaging, WebSockets, remote cursor rendering, and telemetry
 */

const WhiteboardClient = {
  canvas: null,
  ctx: null,
  ws: null,
  currentTool: 'pen',
  currentColor: '#6366f1',
  lineWidth: 3,
  isDrawing: false,
  currentPath: [],
  elements: new Map(), // elementId -> element
  remoteCursors: new Map(), // userId -> cursor DOM element
  myUserId: 'user_' + Math.random().toString(36).substring(2, 7),

  init() {
    this.canvas = document.getElementById('whiteboard-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.setupEvents();
    this.connectWebSocket();
    this.startMetricsPolling();
  },

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.redrawAll();
  },

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/whiteboard`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ Whiteboard WebSocket Connected');
      const badge = document.getElementById('whiteboard-ws-status');
      if (badge) {
        badge.textContent = 'CONNECTED';
        badge.className = 'system-status-pill';
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleSocketMessage(msg);
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    this.ws.onclose = () => {
      const badge = document.getElementById('whiteboard-ws-status');
      if (badge) {
        badge.textContent = 'DISCONNECTED (RECONNECTING...)';
        badge.className = 'btn-danger btn-sm';
      }
      setTimeout(() => this.connectWebSocket(), 2000);
    };
  },

  handleSocketMessage(msg) {
    if (msg.type === 'initial_state') {
      this.elements.clear();
      if (msg.elements) {
        msg.elements.forEach(el => this.elements.set(el.id, el));
      }
      this.redrawAll();
      this.updateSequenceDisplay(msg.seq);
    } else if (msg.type === 'delta') {
      const delta = msg.delta;
      if (delta.op === 'create' || delta.op === 'update') {
        this.elements.set(delta.element.id, delta.element);
      } else if (delta.op === 'delete') {
        this.elements.delete(delta.elementId);
      } else if (delta.op === 'clear') {
        this.elements.clear();
      }
      this.redrawAll();
      this.updateSequenceDisplay(delta.seq);
    } else if (msg.type === 'cursor_move') {
      this.renderRemoteCursor(msg);
    } else if (msg.type === 'user_left') {
      this.removeRemoteCursor(msg.socketId);
    }
  },

  setupEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => {
      this.isDrawing = true;
      const pt = this.getPoint(e);
      this.currentPath = [pt];

      if (this.currentTool === 'sticky') {
        this.createStickyNote(pt.x, pt.y);
        this.isDrawing = false;
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const pt = this.getPoint(e);
      // Send ephemeral cursor
      this.sendCursor(pt.x, pt.y);

      if (!this.isDrawing) return;

      if (this.currentTool === 'pen') {
        this.currentPath.push(pt);
        this.drawStrokeSegment(this.currentPath);
      }
    });

    canvas.addEventListener('mouseup', () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;

      if (this.currentTool === 'pen' && this.currentPath.length > 1) {
        const strokeElement = {
          id: 'stroke-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          type: 'stroke',
          color: this.currentColor,
          width: this.lineWidth,
          points: this.currentPath
        };
        this.elements.set(strokeElement.id, strokeElement);
        this.sendDelta({ op: 'create', element: strokeElement });
      }
      this.currentPath = [];
    });

    // Toolbar buttons
    document.querySelectorAll('.canvas-toolbar .tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        document.querySelectorAll('.canvas-toolbar .tool-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        this.currentTool = target.dataset.tool;
      });
    });

    const colorPicker = document.getElementById('whiteboard-color-picker');
    if (colorPicker) {
      colorPicker.addEventListener('change', (e) => {
        this.currentColor = e.target.value;
      });
    }

    const clearBtn = document.getElementById('whiteboard-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        fetch('/api/whiteboard/clear', { method: 'POST' });
      });
    }
  },

  getPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  },

  createStickyNote(x, y) {
    const text = prompt('Enter note text:', 'System Design Architecture');
    if (!text) return;

    const note = {
      id: 'note-' + Date.now(),
      type: 'sticky',
      x,
      y,
      width: 180,
      height: 120,
      color: '#ffe066',
      text
    };
    this.elements.set(note.id, note);
    this.redrawAll();
    this.sendDelta({ op: 'create', element: note });
  },

  drawStrokeSegment(points) {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = this.currentColor;
    ctx.lineWidth = this.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
  },

  redrawAll() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const el of this.elements.values()) {
      if (el.type === 'stroke') {
        this.renderStroke(el);
      } else if (el.type === 'sticky') {
        this.renderSticky(el);
      }
    }
  },

  renderStroke(el) {
    if (!el.points || el.points.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = el.color || '#fff';
    ctx.lineWidth = el.width || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) {
      ctx.lineTo(el.points[i].x, el.points[i].y);
    }
    ctx.stroke();
  },

  renderSticky(el) {
    const ctx = this.ctx;
    ctx.fillStyle = el.color || '#ffe066';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.shadowBlur = 0;

    // Sticky border
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.strokeRect(el.x, el.y, el.width, el.height);

    // Text
    ctx.fillStyle = '#1e293b';
    ctx.font = '13px "JetBrains Mono", sans-serif';
    const lines = el.text.split('\n');
    lines.forEach((line, idx) => {
      ctx.fillText(line, el.x + 12, el.y + 24 + (idx * 18));
    });
  },

  sendDelta(delta) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'delta', delta }));
    }
  },

  sendCursor(x, y) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'cursor', x, y }));
    }
  },

  renderRemoteCursor(msg) {
    const container = document.querySelector('.canvas-wrapper');
    if (!container) return;

    let el = this.remoteCursors.get(msg.userId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'remote-cursor';
      el.innerHTML = `
        <div class="cursor-pointer" style="border-bottom-color: ${msg.color || '#f43f5e'}"></div>
        <div class="cursor-tag">${msg.name || 'Architect'}</div>
      `;
      container.appendChild(el);
      this.remoteCursors.set(msg.userId, el);
    }
    el.style.transform = `translate(${msg.cursor.x}px, ${msg.cursor.y}px)`;
  },

  removeRemoteCursor(socketId) {
    const el = this.remoteCursors.get(socketId);
    if (el) {
      el.remove();
      this.remoteCursors.delete(socketId);
    }
  },

  updateSequenceDisplay(seq) {
    const el = document.getElementById('whiteboard-seq-num');
    if (el) el.textContent = '#' + (seq || 0);
  },

  startMetricsPolling() {
    setInterval(async () => {
      try {
        const res = await fetch('/api/whiteboard/metrics');
        const data = await res.json();
        
        const deltaBytesEl = document.getElementById('wb-delta-bytes');
        const savedPercentEl = document.getElementById('wb-saved-percent');
        const snapshotsCountEl = document.getElementById('wb-snapshots-count');
        const elementsCountEl = document.getElementById('wb-elements-count');

        if (deltaBytesEl) deltaBytesEl.textContent = (data.deltaBytesTransferred / 1024).toFixed(1) + ' KB';
        if (savedPercentEl) savedPercentEl.textContent = data.bandwidthSavingsPercent || '0%';
        if (snapshotsCountEl) snapshotsCountEl.textContent = data.snapshotsCreated;
        if (elementsCountEl) elementsCountEl.textContent = data.activeElementsCount;
      } catch (e) {
        // ignore
      }
    }, 1500);
  }
};
