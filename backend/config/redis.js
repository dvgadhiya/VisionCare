import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

export const createRedisConnection = () => new Redis(redisConfig);
export const redisPub = new Redis(redisConfig);
export const redisSub = new Redis(redisConfig);
export default redisConfig;
