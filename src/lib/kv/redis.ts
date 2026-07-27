import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;
let ephemeralWarningLogged = false;

const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

if (url && token && /^https:\/\//i.test(url)) {
  redisClient = new Redis({
    url,
    token,
  });
} else if (url || token) {
  console.warn(
    '[redis] UPSTASH_REDIS_REST_URL/TOKEN present but URL is not https — Redis disabled for this process.',
  );
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

/** True when Upstash Redis is configured — chat memory survives cold starts. */
export function isMemoryDurable(): boolean {
  return Boolean(redisClient);
}

/**
 * Log once per process when memory is ephemeral (local/dev without Redis).
 * Call on first get/set of chat memory — not on module load — so status probes
 * that never touch memory stay quiet.
 */
export function warnIfMemoryEphemeral(): void {
  if (isMemoryDurable() || ephemeralWarningLogged) return;
  ephemeralWarningLogged = true;
  console.warn(
    '[memory] WARNING: no Redis/KV configured — chat memory is ephemeral and will not survive serverless cold starts or multiple instances.',
  );
}
