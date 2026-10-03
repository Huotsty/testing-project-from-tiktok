/**
 * System Design Module 1: Real-Time Collaborative Whiteboard
 * 
 * Core System Design Principles:
 * 1. Delta-State Synchronization: Send only incremental mutation events (strokes,
 *    shapes, moves) instead of serialized full canvas state over WebSockets.
 * 2. Monotonic Sequence Ordering: Every delta has a sequence ID (seq) to allow
 *    clients to detect dropped packets or reorder out-of-order deliveries.
 * 3. Log Compaction / Snapshotting: Periodic snapshots prevent the event log from
 *    growing infinitely, allowing newly connected clients to hydrate quickly (Snapshot + tail deltas).
 * 4. Ephemeral Presence: Cursor positions and active user selections are broadcast
 *    without being saved into the persistent snapshot log (transient data).
 * 5. Bandwidth Telemetry: Tracks real-time bytes of deltas vs full snapshots.
 */

const fs = require('fs');
const path = require('path');

class WhiteboardService {
  constructor() {
    this.boardId = 'main-canvas';
    // Canvas elements: Map of elementId -> elementData (reconstructed current state)
    this.elements = new Map();
    // Monotonic sequence number
    this.sequenceNumber = 0;
    // Compaction threshold: compact after this many deltas
    this.compactionThreshold = 50;
    this.deltasSinceSnapshot = 0;
    // Event log of recent operations since last snapshot
    this.operationLog = [];
    
    // Connected users: socketId -> { userId, name, color, cursor: {x,y}, active: true }
    this.users = new Map();

    // Telemetry metrics
    this.metrics = {
      totalDeltasProcessed: 0,
      deltaBytesTransferred: 0,
      snapshotsCreated: 0,
      estimatedFullSnapshotBytesAvoided: 0,
      connectedClients: 0
    };

    // Load initial sample board if empty
    this.initDefaultBoard();
  }

  initDefaultBoard() {
    const welcomeNote = {
      id: 'welcome-sticky',
      type: 'sticky',
      x: 80,
      y: 80,
      width: 220,
      height: 160,
      color: '#ffe066',
      text: '🎨 Collaborative Whiteboard\n\nDelta-based WebSocket sync in action.\nDraw something with a friend!',
      userId: 'system',
      updatedAt: Date.now()
    };
    this.elements.set(welcomeNote.id, welcomeNote);
  }

  /**
   * Register a connected user
   */
  registerUser(socketId, userInfo) {
    const user = {
      socketId,
      userId: userInfo.userId || `user-${Math.random().toString(36).substring(2, 7)}`,
      name: userInfo.name || `Architect #${Math.floor(Math.random() * 900 + 100)}`,
      color: userInfo.color || this.getRandomColor(),
      cursor: { x: 0, y: 0 },
      joinedAt: Date.now()
    };
    this.users.set(socketId, user);
    this.metrics.connectedClients = this.users.size;
    return user;
  }

  removeUser(socketId) {
    const user = this.users.get(socketId);
    this.users.delete(socketId);
    this.metrics.connectedClients = this.users.size;
    return user;
  }

  getUser(socketId) {
    return this.users.get(socketId);
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  /**
   * Returns snapshot for a newly connected client:
   * Current compacted state + latest sequence number
   */
  getInitialState() {
    const elementsArray = Array.from(this.elements.values());
    const snapshotSize = JSON.stringify(elementsArray).length;
    return {
      type: 'initial_state',
      seq: this.sequenceNumber,
      elements: elementsArray,
      users: this.getAllUsers(),
      snapshotSize
    };
  }

  /**
   * Process an incoming delta event from a client.
   * Delta operations can be:
   * - 'create': add a new shape / stroke
   * - 'update': move or modify an existing element
   * - 'delete': remove an element
   * - 'clear': wipe canvas
   */
  processDelta(senderSocketId, delta) {
    this.sequenceNumber++;
    this.deltasSinceSnapshot++;
    this.metrics.totalDeltasProcessed++;

    const payload = {
      ...delta,
      seq: this.sequenceNumber,
      timestamp: Date.now()
    };

    const deltaSize = JSON.stringify(payload).length;
    this.metrics.deltaBytesTransferred += deltaSize;

    // Estimate what a full canvas sync would have cost:
    const fullStateEstimatedSize = JSON.stringify(Array.from(this.elements.values())).length;
    this.metrics.estimatedFullSnapshotBytesAvoided += Math.max(0, fullStateEstimatedSize - deltaSize);

    // Apply delta to in-memory state
    switch (delta.op) {
      case 'create':
      case 'update':
        if (delta.element && delta.element.id) {
          this.elements.set(delta.element.id, delta.element);
        }
        break;
      case 'delete':
        if (delta.elementId) {
          this.elements.delete(delta.elementId);
        }
        break;
      case 'clear':
        this.elements.clear();
        break;
    }

    this.operationLog.push(payload);

    // Check if compaction is needed
    if (this.deltasSinceSnapshot >= this.compactionThreshold) {
      this.compactSnapshot();
    }

    return payload;
  }

  /**
   * Compaction / Snapshotting:
   * Flushes old operation logs and resets deltas counter.
   */
  compactSnapshot() {
    this.metrics.snapshotsCreated++;
    this.deltasSinceSnapshot = 0;
    // Retain only the last 20 deltas for lag-recovery if needed
    if (this.operationLog.length > 20) {
      this.operationLog = this.operationLog.slice(-20);
    }
  }

  /**
   * Ephemeral cursor update (not stored in state log)
   */
  updateCursor(socketId, x, y) {
    const user = this.users.get(socketId);
    if (user) {
      user.cursor = { x, y };
      return {
        type: 'cursor_move',
        userId: user.userId,
        name: user.name,
        color: user.color,
        cursor: { x, y }
      };
    }
    return null;
  }

  getMetrics() {
    const savingsRatio = this.metrics.estimatedFullSnapshotBytesAvoided > 0
      ? ((this.metrics.estimatedFullSnapshotBytesAvoided / (this.metrics.estimatedFullSnapshotBytesAvoided + this.metrics.deltaBytesTransferred)) * 100).toFixed(1)
      : 0;

    return {
      ...this.metrics,
      activeElementsCount: this.elements.size,
      currentSequence: this.sequenceNumber,
      deltasInCurrentSnapshot: this.deltasSinceSnapshot,
      bandwidthSavingsPercent: `${savingsRatio}%`
    };
  }

  getRandomColor() {
    const colors = ['#f43f5e', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

module.exports = new WhiteboardService();
