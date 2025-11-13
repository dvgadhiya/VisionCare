import { Queue, Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';

const connection = createRedisConnection();

export const frameQueue = new Queue('frame-processing', { connection });
export const inferenceQueue = new Queue('inference-processing', { connection });

export const addFrameJob = async (data) => {
  return await frameQueue.add('process-frame', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  });
};

export const addInferenceJob = async (data) => {
  return await inferenceQueue.add('run-inference', data, {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  });
};
