import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { redisPub, redisSub } from '../config/redis.js';

export class WebSocketService {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Map(); // Map<WebSocket, ClientInfo>
    this.sessions = new Map(); // Map<sessionId, Set<WebSocket>>
    this.setupRedisSubscriptions();
    this.initialize();
  }

  initialize() {
    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      console.error('[WebSocketService] Server error:', error);
    });

    // Heartbeat to detect dead connections
    this.startHeartbeat();
  }

  handleConnection(ws, request) {
    const sessionId = uuidv4();
    const clientInfo = {
      sessionId,
      connectedAt: Date.now(),
      ip: request.socket.remoteAddress,
      isAlive: true,
      metadata: {}
    };

    this.clients.set(ws, clientInfo);
    
    // Track sessions for multi-connection support
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    this.sessions.get(sessionId).add(ws);

    console.log(`[WebSocketService] Client connected: ${sessionId} (Total: ${this.clients.size})`);

    // Send welcome message
    this.sendToClient(ws, {
      type: 'connection',
      sessionId,
      message: 'Connected successfully'
    });

    // Setup event handlers
    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('pong', () => this.handlePong(ws));
    ws.on('close', (code, reason) => this.handleClose(ws, code, reason));
    ws.on('error', (error) => this.handleError(ws, error));
  }

  handleMessage(ws, data) {
    try {
      const clientInfo = this.clients.get(ws);
      if (!clientInfo) return;

      // Check if message is JSON or binary
      let message;
      if (typeof data === 'string') {
        try {
          message = JSON.parse(data);
          this.emit('json_message', { ws, clientInfo, message });
        } catch {
          // Not JSON, treat as text
          this.emit('text_message', { ws, clientInfo, data: data.toString() });
        }
      } else {
        // Binary data (image frames, etc.)
        this.emit('binary_message', { ws, clientInfo, data });
      }
    } catch (error) {
      console.error('[WebSocketService] Message handling error:', error);
      this.sendError(ws, 'Failed to process message');
    }
  }

  handlePong(ws) {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.isAlive = true;
    }
  }

  handleClose(ws, code, reason) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    const { sessionId } = clientInfo;
    
    // Remove from session tracking
    const sessionClients = this.sessions.get(sessionId);
    if (sessionClients) {
      sessionClients.delete(ws);
      if (sessionClients.size === 0) {
        this.sessions.delete(sessionId);
        this.emit('session_ended', { sessionId });
      }
    }

    // Remove from clients
    this.clients.delete(ws);

    console.log(`[WebSocketService] Client disconnected: ${sessionId} (Code: ${code}, Reason: ${reason || 'none'})`);
    console.log(`[WebSocketService] Active connections: ${this.clients.size}`);

    this.emit('client_disconnected', { sessionId, clientInfo, code, reason });
  }

  handleError(ws, error) {
    const clientInfo = this.clients.get(ws);
    console.error('[WebSocketService] Client error:', error, clientInfo?.sessionId);
  }

  // Send message to specific client
  sendToClient(ws, data) {
    if (ws.readyState !== 1) return false; // Not OPEN

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      ws.send(message);
      return true;
    } catch (error) {
      console.error('[WebSocketService] Send error:', error);
      return false;
    }
  }

  // Send to specific session (all connections of that session)
  sendToSession(sessionId, data) {
    const sessionClients = this.sessions.get(sessionId);
    if (!sessionClients) return 0;

    let sent = 0;
    sessionClients.forEach(ws => {
      if (this.sendToClient(ws, data)) sent++;
    });

    return sent;
  }

  // Broadcast to all connected clients
  broadcast(data, excludeWs = null) {
    let sent = 0;
    this.clients.forEach((clientInfo, ws) => {
      if (ws !== excludeWs && this.sendToClient(ws, data)) {
        sent++;
      }
    });
    return sent;
  }

  // Broadcast to all clients except the sender
  broadcastExcept(data, senderWs) {
    return this.broadcast(data, senderWs);
  }

  // Send error message to client
  sendError(ws, message, code = 'ERROR') {
    this.sendToClient(ws, {
      type: 'error',
      code,
      message
    });
  }

  // Setup Redis subscriptions for cross-server communication
  setupRedisSubscriptions() {
    redisSub.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        
        switch (channel) {
          case 'blink-updates':
            this.handleBlinkUpdate(data);
            break;
          case 'sensor-updates':
            this.handleSensorUpdate(data);
            break;
          case 'inference-results':
            this.handleInferenceResults(data);
            break;
          case 'broadcast':
            this.broadcast(data);
            break;
          default:
            console.log(`[WebSocketService] Unknown channel: ${channel}`);
        }
      } catch (error) {
        console.error('[WebSocketService] Redis message error:', error);
      }
    });

    // Subscribe to channels
    redisSub.subscribe('blink-updates', 'sensor-updates', 'inference-results', 'broadcast')
      .then(() => console.log('[WebSocketService] Subscribed to Redis channels'))
      .catch(err => console.error('[WebSocketService] Redis subscription error:', err));
  }

  handleBlinkUpdate(data) {
    if (data.sessionId) {
      this.sendToSession(data.sessionId, {
        type: 'blink_update',
        ...data.stats
      });
    } else {
      this.broadcast({ type: 'blink_update', ...data });
    }
  }

  handleSensorUpdate(data) {
    this.broadcast({
      type: 'sensor_update',
      ...data
    });
  }

  handleInferenceResults(data) {
    if (data.sessionId) {
      this.sendToSession(data.sessionId, {
        type: 'inference_complete',
        ...data
      });
    }
  }

  // Publish message to Redis for cross-server broadcasting
  async publishToRedis(channel, data) {
    try {
      await redisPub.publish(channel, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('[WebSocketService] Redis publish error:', error);
      return false;
    }
  }

  // Heartbeat mechanism to detect dead connections
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((clientInfo, ws) => {
        if (!clientInfo.isAlive) {
          console.log(`[WebSocketService] Terminating dead connection: ${clientInfo.sessionId}`);
          return ws.terminate();
        }

        clientInfo.isAlive = false;
        ws.ping();
      });
    }, 30000); // Every 30 seconds
  }

  // Event emitter functionality for custom handlers
  eventHandlers = new Map();

  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  emit(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[WebSocketService] Event handler error for ${event}:`, error);
        }
      });
    }
  }

  // Get client info
  getClientInfo(ws) {
    return this.clients.get(ws);
  }

  // Get all clients for a session
  getSessionClients(sessionId) {
    return Array.from(this.sessions.get(sessionId) || []);
  }

  // Update client metadata
  updateClientMetadata(ws, metadata) {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.metadata = { ...clientInfo.metadata, ...metadata };
    }
  }

  // Get statistics
  getStats() {
    return {
      totalConnections: this.clients.size,
      totalSessions: this.sessions.size,
      connections: Array.from(this.clients.values()).map(info => ({
        sessionId: info.sessionId,
        connectedAt: info.connectedAt,
        duration: Date.now() - info.connectedAt,
        ip: info.ip
      }))
    };
  }

  // Graceful shutdown
  async shutdown() {
    console.log('[WebSocketService] Shutting down...');
    
    clearInterval(this.heartbeatInterval);

    // Notify all clients
    this.broadcast({
      type: 'server_shutdown',
      message: 'Server is shutting down'
    });

    // Close all connections
    this.clients.forEach((clientInfo, ws) => {
      ws.close(1001, 'Server shutdown');
    });

    // Close server
    return new Promise((resolve) => {
      this.wss.close(() => {
        console.log('[WebSocketService] Shutdown complete');
        resolve();
      });
    });
  }
}
