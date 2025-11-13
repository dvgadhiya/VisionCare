// app.js
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

// Import configurations
import { redisPub, redisSub } from './config/redis.js';
import { 
  getS3Status, 
  listObjects, 
  ensureBucket, 
  cleanupOldFiles 
} from './config/s3.js';

// Import models and database
import { 
  initializeDatabase, 
  Frame, 
  InferenceResult, 
  BlinkStat, 
  SensorReading, 
  Session,
  DatabaseHelpers,
  sequelize
} from './models/database.models.js';

// Import services
import { WebSocketService } from './services/websocket.service.js';
import { StorageService } from './services/storage.service.js';
import { InferenceService } from './services/inference.service.js';

// Import queue configuration
import { addInferenceJob, frameQueue, inferenceQueue } from './queues/queue.config.js';

// Import routes
import authRoutes from './routes/auth.routes.js';

// Load environment variables
console.log(import.meta.url)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const server = createServer(app);

// Configuration
const PORT = process.env.PORT || 8000;
const WORKER_ID = process.env.pm_id || process.pid;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS configuration
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8000', 'http://127.0.0.1:8000'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600 // Cache preflight requests for 10 minutes
}));
// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));
app.use('/static', express.static(path.join(__dirname, '..', 'frontend', 'public')));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - Worker: ${WORKER_ID}`);
  next();
});

// Global state
let wsService = null;
const activeSessions = new Map(); // sessionId -> session data

// ==================== INITIALIZATION ====================

async function initializeServices() {
  try {
    console.log('\n[Initialization] Starting services...\n');

    // 1. Initialize Database
    console.log('[1/5] Initializing PostgreSQL database...');
    await initializeDatabase();
    console.log('✓ Database connected and synced');

    // 2. Initialize S3 Ninja
    console.log('\n[2/5] Initializing S3 Ninja...');
    try {
      await StorageService.initialize();
      const s3Status = await getS3Status();
      console.log('✓ S3 Status:', s3Status.connected ? 'Connected' : 'Disconnected');
      if (s3Status.connected) {
        console.log('  Endpoint:', s3Status.endpoint);
        console.log('  Buckets:', s3Status.buckets.join(', ') || 'none');
      } else {
        console.warn('⚠ S3 not connected, but continuing...');
      }
    } catch (error) {
      console.warn('⚠ S3 initialization warning:', error.message);
      console.warn('  App will continue, but file upload may fail');
    }

    // 3. Initialize Redis
    console.log('\n[3/4] Initializing Redis...');
    await redisPub.ping();
    console.log('✓ Redis connected');

    // 4. Initialize WebSocket Service
    console.log('\n[4/4] Initializing WebSocket Service...');
    wsService = new WebSocketService(server);
    setupWebSocketHandlers();
    console.log('✓ WebSocket Service ready');

    console.log('\n[Initialization] All services started successfully!\n');
    return true;
  } catch (error) {
    console.error('[Initialization] Error:', error);
    throw error;
  }
}

// ==================== WEBSOCKET HANDLERS ====================

function setupWebSocketHandlers() {
  // Handle binary messages (video frames)
 wsService.on('binary_message', async ({ ws, clientInfo, data }) => {
  try {
    const text = data.toString();
    const [header, encoded] = text.split(',');
    
    if (!encoded) {
      wsService.sendError(ws, 'Invalid frame format');
      return;
    }

    const buffer = Buffer.from(encoded, 'base64');
    const timestamp = Date.now();
    const filename = `${timestamp}_${uuidv4().substring(0, 8)}.jpg`;
    
    // Save to S3/MinIO and DB
    const { frameId, s3Key, size } = await StorageService.saveFrame(
      buffer, 
      filename, 
      clientInfo.sessionId
    );
    
    // Update session frame count
    await updateSessionFrameCount(clientInfo.sessionId);

    // Queue for inference processing
    await addInferenceJob({ 
      frameId, 
      s3Key, 
      sessionId: clientInfo.sessionId 
    });

    // Send acknowledgment
    wsService.sendToClient(ws, {
      type: 'frame_received',
      frameId,
      sessionId: clientInfo.sessionId,
      filename,
      size,
      queuedForInference: true
    });

  } catch (error) {
    console.error('[WebSocket] Frame processing error:', error);
    wsService.sendError(ws, 'Failed to process frame');
  }
});

  // Handle JSON messages
  wsService.on('json_message', async ({ ws, clientInfo, message }) => {
    try {
      const { type, data } = message;

      switch (type) {
        case 'ping':
          wsService.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
          break;

        case 'get_stats':
          const stats = await getSessionStats(clientInfo.sessionId);
          wsService.sendToClient(ws, { type: 'stats', data: stats });
          break;

        case 'request_blink_detection':
          // Client can request blink detection on specific frame
          if (data.frameId) {
            // Trigger blink detection (implementation depends on your flow)
            wsService.sendToClient(ws, { 
              type: 'blink_detection_queued', 
              frameId: data.frameId 
            });
          }
          break;

        default:
          console.log(`[WebSocket] Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error('[WebSocket] Message handling error:', error);
      wsService.sendError(ws, 'Failed to process message');
    }
  });

  // Handle text messages
  wsService.on('text_message', async ({ ws, clientInfo, data }) => {
    console.log(`[WebSocket] Text message from ${clientInfo.sessionId}:`, data.substring(0, 100));
    wsService.sendToClient(ws, { 
      type: 'echo', 
      message: 'Message received',
      length: data.length 
    });
  });

  // Handle client connection
  wsService.on('client_connected', async ({ sessionId, clientInfo }) => {
    // Create session in database
    await Session.create({
      session_id: sessionId,
      user_agent: clientInfo.metadata?.userAgent || 'Unknown',
      ip_address: clientInfo.ip,
      is_active: true
    });

    activeSessions.set(sessionId, {
      connectedAt: Date.now(),
      frameCount: 0,
      blinkCount: 0
    });

    console.log(`[App] New session created: ${sessionId}`);
  });

  // Handle session end
  wsService.on('session_ended', async ({ sessionId }) => {
    // Update session in database
    await DatabaseHelpers.endSession(sessionId);

    activeSessions.delete(sessionId);
    console.log(`[App] Session ended: ${sessionId}`);
  });
}

// ==================== HELPER FUNCTIONS ====================

async function updateSessionFrameCount(sessionId) {
  try {
    const session = await Session.findOne({ where: { session_id: sessionId } });
    if (session) {
      await session.update({ 
        total_frames: session.total_frames + 1 
      });
    }

    const sessionData = activeSessions.get(sessionId);
    if (sessionData) {
      sessionData.frameCount++;
    }
  } catch (error) {
    console.error('[App] Error updating session frame count:', error);
  }
}

async function getSessionStats(sessionId) {
  try {
    const stats = await DatabaseHelpers.getSessionStats(sessionId);
    return {
      ...stats,
      activeSession: activeSessions.get(sessionId) || null
    };
  } catch (error) {
    console.error('[App] Error getting session stats:', error);
    return null;
  }
}

// ==================== ROUTES ====================

// Mount auth routes
app.use('/api/auth', authRoutes);

// ==================== REST API ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    worker: WORKER_ID,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname,".." ,'frontend', 'templates', 'index.html'));
});

// ==================== S3 ROUTES ====================

// S3 Ninja status
app.get('/api/s3/status', async (req, res) => {
  try {
    const status = await getS3Status();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List stored frames
app.get('/api/s3/frames', async (req, res) => {
  try {
    const { prefix = 'frames/', limit = 100 } = req.query;
    const objects = await listObjects(null, prefix);
    
    res.json({
      count: objects.length,
      frames: objects.slice(0, parseInt(limit)).map(obj => ({
        key: obj.Key,
        size: obj.Size,
        sizeKB: (obj.Size / 1024).toFixed(2),
        lastModified: obj.LastModified
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SENSOR ROUTES ====================

// Receive sensor data
app.post('/api/sensor', async (req, res) => {
  try {
    const { temp, hum, ldr, sessionId } = req.body;

    if (temp === undefined || hum === undefined || ldr === undefined) {
      return res.status(400).json({ error: 'Missing required fields: temp, hum, ldr' });
    }
    
    // Save to database
    const reading = await SensorReading.create({
      temp: parseFloat(temp),
      hum: parseFloat(hum),
      ldr: parseFloat(ldr),
      session_id: sessionId || null
    });

    const sensorData = {
      id: reading.id,
      temp: reading.temp,
      hum: reading.hum,
      ldr: reading.ldr,
      timestamp: reading.timestamp
    };

    // Broadcast to all connected clients via Redis
    await redisPub.publish('sensor-updates', JSON.stringify(sensorData));

    res.json({ 
      status: 'ok', 
      received: sensorData 
    });
  } catch (error) {
    console.error('[API] Sensor error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sensor readings
app.get('/api/sensor/readings', async (req, res) => {
  try {
    const { sessionId, limit = 50 } = req.query;
    
    const where = sessionId ? { session_id: sessionId } : {};
    
    const readings = await SensorReading.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({
      count: readings.length,
      readings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get sensor aggregates
app.get('/api/sensor/aggregates/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { timeWindow = 300000 } = req.query; // 5 minutes default
    
    const aggregates = await DatabaseHelpers.getSensorAggregates(
      sessionId, 
      parseInt(timeWindow)
    );

    res.json(aggregates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SESSION ROUTES ====================

// Get session statistics
app.get('/api/stats/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const stats = await getSessionStats(sessionId);
    
    if (!stats) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all active sessions
app.get('/api/sessions/active', async (req, res) => {
  try {
    const sessions = await Session.findAll({
      where: { is_active: true },
      order: [['started_at', 'DESC']]
    });

    res.json({
      count: sessions.length,
      sessions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session details
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findOne({
      where: { session_id: sessionId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INFERENCE ROUTES ====================

// Get recent inference results
app.get('/api/inference/recent', async (req, res) => {
  try {
    const { sessionId, limit = 10 } = req.query;
    
    const results = await DatabaseHelpers.getRecentInferences(
      parseInt(limit), 
      sessionId
    );

    res.json({
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get inference result by frame ID
app.get('/api/inference/frame/:frameId', async (req, res) => {
  try {
    const { frameId } = req.params;
    
    const result = await InferenceResult.findOne({
      where: { frame_id: frameId },
      include: [{
        model: Frame,
        as: 'frame'
      }]
    });

    if (!result) {
      return res.status(404).json({ error: 'Inference result not found' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BLINK STATS ROUTES ====================

// Get blink statistics
app.get('/api/blinks/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 100 } = req.query;
    
    const blinks = await BlinkStat.findAll({
      where: { session_id: sessionId },
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({
      count: blinks.length,
      blinks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== STORAGE ROUTES ====================

// Manual cleanup
app.post('/api/storage/cleanup', async (req, res) => {
  try {
    const { daysOld = 7 } = req.body;
    const result = await StorageService.cleanupOldFrames(parseInt(daysOld));
    
    res.json({ 
      status: 'cleanup_complete',
      deleted: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get frame by ID
app.get('/api/frames/:frameId', async (req, res) => {
  try {
    const { frameId } = req.params;
    
    const frame = await Frame.findByPk(frameId);
    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    res.json(frame);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get frame URL
app.get('/api/frames/:frameId/url', async (req, res) => {
  try {
    const { frameId } = req.params;
    const url = await StorageService.getFrameUrl(frameId);
    
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== QUEUE MONITORING ROUTES ====================

// Get queue statistics
app.get('/api/queues/stats', async (req, res) => {
  try {
    const [frameQueueStats, inferenceQueueStats] = await Promise.all([
      frameQueue.getJobCounts(),
      inferenceQueue.getJobCounts()
    ]);

    res.json({
      frameQueue: frameQueueStats,
      inferenceQueue: inferenceQueueStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== WEBSOCKET CONNECTION INFO ====================

// Get WebSocket statistics
app.get('/api/websocket/stats', (req, res) => {
  if (!wsService) {
    return res.status(503).json({ error: 'WebSocket service not initialized' });
  }

  const stats = wsService.getStats();
  res.json(stats);
});

// ==================== SYSTEM ROUTES ====================

// Get system information
app.get('/api/system/info', async (req, res) => {
  try {
    const [s3Status, dbStats, queueStats] = await Promise.all([
      getS3Status(),
      getDatabaseStats(),
      getQueueStats()
    ]);

    res.json({
      worker: WORKER_ID,
      environment: NODE_ENV,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      s3: s3Status,
      database: dbStats,
      queues: queueStats,
      activeSessions: activeSessions.size,
      websocket: wsService ? wsService.getStats() : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function getDatabaseStats() {
  try {
    const [frames, sessions, inferences, sensors, blinks] = await Promise.all([
      Frame.count(),
      Session.count(),
      InferenceResult.count(),
      SensorReading.count(),
      BlinkStat.count()
    ]);

    return {
      connected: true,
      frames,
      sessions,
      inferences,
      sensors,
      blinks
    };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

async function getQueueStats() {
  try {
    const [frameStats, inferenceStats] = await Promise.all([
      frameQueue.getJobCounts(),
      inferenceQueue.getJobCounts()
    ]);

    return {
      frameQueue: frameStats,
      inferenceQueue: inferenceStats
    };
  } catch (error) {
    return { error: error.message };
  }
}

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Express] Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ==================== SCHEDULED TASKS ====================

// Daily cleanup task
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

function startScheduledTasks() {
  // Run cleanup every 24 hours
  setInterval(async () => {
    console.log('[Scheduler] Running daily cleanup...');
    try {
      await StorageService.cleanupOldFrames(7);
      console.log('[Scheduler] Cleanup completed');
    } catch (error) {
      console.error('[Scheduler] Cleanup error:', error);
    }
  }, CLEANUP_INTERVAL);

  // Run initial cleanup after 1 hour
  setTimeout(async () => {
    console.log('[Scheduler] Running initial cleanup...');
    await StorageService.cleanupOldFrames(7);
  }, 60 * 60 * 1000);
}

// ==================== GRACEFUL SHUTDOWN ====================

async function gracefulShutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Close WebSocket connections
    if (wsService) {
      console.log('[Shutdown] Closing WebSocket connections...');
      await wsService.shutdown();
    }

    // Close database connection
    console.log('[Shutdown] Closing database connection...');
    await sequelize.close();

    // Close Redis connections
    console.log('[Shutdown] Closing Redis connections...');
    await redisPub.quit();
    await redisSub.quit();

    // Close HTTP server
    console.log('[Shutdown] Closing HTTP server...');
    server.close(() => {
      console.log('[Shutdown] Server closed successfully');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout');
      process.exit(1);
    }, 10000);

  } catch (error) {
    console.error('[Shutdown] Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Process] Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==================== START SERVER ====================

async function startServer() {
  try {
    // Initialize all services
    await initializeServices();

    // Start scheduled tasks
    startScheduledTasks();

    // Start HTTP server
    server.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(60));
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
      console.log(`   Worker ID: ${WORKER_ID}`);
      console.log(`   Environment: ${NODE_ENV}`);
      console.log(`   WebSocket: ws://0.0.0.0:${PORT}/ws`);
      console.log(`   S3 Ninja UI: http://localhost:9444`);
      console.log('='.repeat(60) + '\n');
    });

  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
