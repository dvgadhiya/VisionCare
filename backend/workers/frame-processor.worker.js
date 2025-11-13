import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { InferenceService } from '../services/inference.service.js';
import { StorageService } from '../services/storage.service.js';

const connection = createRedisConnection();

const inferenceWorker = new Worker(
  'inference-processing',
  async (job) => {
    const { frameId, s3Key } = job.data;
    
    console.log(`[InferenceWorker] Processing frame ${frameId}`);
    
    const results = await InferenceService.processFrame(frameId, s3Key);
    await StorageService.markFrameProcessed(frameId);
    
    return results;
  },
  {
    connection,
    concurrency: 5, // Process 5 frames simultaneously
    limiter: {
      max: 10,
      duration: 1000 // 10 jobs per second max
    }
  }
);

inferenceWorker.on('completed', (job) => {
  console.log(`[InferenceWorker] Job ${job.id} completed`);
});

inferenceWorker.on('failed', (job, err) => {
  console.error(`[InferenceWorker] Job ${job.id} failed:`, err);
});

console.log('[InferenceWorker] Started');
