import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (url && token) {
  redisClient = new Redis({
    url,
    token,
  });
}

export function getRedisClient(): Redis | null {
  return redisClient;
}
