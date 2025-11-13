import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { InferenceService } from '../services/inference.service.js';
import { StorageService } from '../services/storage.service.js';
import { InferenceResult, Frame } from '../models/database.models.js';
import { redisPub } from '../config/redis.js';

const connection = createRedisConnection();

// Worker configuration
const WORKER_CONFIG = {
  connection,
  concurrency: parseInt(process.env.INFERENCE_CONCURRENCY || '5'),
  limiter: {
    max: parseInt(process.env.INFERENCE_MAX_JOBS || '10'),
    duration: 1000 // per second
  },
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 2
  }
};

// Main inference worker
const inferenceWorker = new Worker(
  'inference-processing',
  async (job) => {
    return await processInferenceJob(job);
  },
  WORKER_CONFIG
);

// Job processor function
async function processInferenceJob(job) {
  const startTime = Date.now();
  const { frameId, s3Key, sessionId } = job.data;

  try {
    console.log(`[InferenceWorker] Processing frame ${frameId} (Job: ${job.id})`);

    // Update job progress
    await job.updateProgress(10);

    // Run inference
    const results = await InferenceService.processFrame(frameId, s3Key);
    await job.updateProgress(70);

    // Save results to database
    const inferenceRecord = await InferenceResult.create({
      frame_id: frameId,
      emotion_label: results.emotionLabel,
      emotion_confidence: results.emotionConf,
      redness_label: results.rednessLabel,
      redness_confidence: results.rednessConf,
      processing_time_ms: Date.now() - startTime
    });

    await job.updateProgress(90);

    // Mark frame as processed
    await StorageService.markFrameProcessed(frameId);

    // Broadcast results via Redis if session exists
    if (sessionId) {
      await redisPub.publish('inference-results', JSON.stringify({
        sessionId,
        frameId,
        ...results,
        processingTime: Date.now() - startTime
      }));
    }

    await job.updateProgress(100);

    console.log(`[InferenceWorker] Completed frame ${frameId} in ${Date.now() - startTime}ms`);

    return {
      success: true,
      frameId,
      inferenceId: inferenceRecord.id,
      processingTime: Date.now() - startTime,
      results
    };

  } catch (error) {
    console.error(`[InferenceWorker] Error processing frame ${frameId}:`, error);
    
    // Log failure to database
    try {
      await InferenceResult.create({
        frame_id: frameId,
        emotion_label: 'ERROR',
        emotion_confidence: null,
        redness_label: 'ERROR',
        redness_confidence: null,
        processing_time_ms: Date.now() - startTime
      });
    } catch (dbError) {
      console.error('[InferenceWorker] Failed to log error:', dbError);
    }

    throw error; // Re-throw for BullMQ retry mechanism
  }
}

// Event handlers
inferenceWorker.on('completed', (job, result) => {
  console.log(`[InferenceWorker] ✓ Job ${job.id} completed:`, result.frameId);
});

inferenceWorker.on('failed', (job, error) => {
  console.error(`[InferenceWorker] ✗ Job ${job.id} failed:`, error.message);
  
  if (job.attemptsMade >= job.opts.attempts) {
    console.error(`[InferenceWorker] Job ${job.id} exhausted all retry attempts`);
  }
});

inferenceWorker.on('progress', (job, progress) => {
  console.log(`[InferenceWorker] Job ${job.id} progress: ${progress}%`);
});

inferenceWorker.on('stalled', (jobId) => {
  console.warn(`[InferenceWorker] ⚠ Job ${jobId} stalled`);
});

inferenceWorker.on('error', (error) => {
  console.error('[InferenceWorker] Worker error:', error);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`[InferenceWorker] Received ${signal}, starting graceful shutdown...`);
  
  try {
    await inferenceWorker.close();
    console.log('[InferenceWorker] Worker closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[InferenceWorker] Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log('[InferenceWorker] Started with concurrency:', WORKER_CONFIG.concurrency);

export default inferenceWorker;
