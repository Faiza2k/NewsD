import { Index } from '@upstash/vector';

let indexClient: Index | null | undefined;

export function isVectorConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_VECTOR_REST_URL?.trim() && process.env.UPSTASH_VECTOR_REST_TOKEN?.trim(),
  );
}

/** Shared Upstash Vector client. Returns null when env is missing. */
export function getVectorIndex(): Index | null {
  if (indexClient !== undefined) return indexClient;
  const url = process.env.UPSTASH_VECTOR_REST_URL?.trim();
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN?.trim();
  if (!url || !token) {
    indexClient = null;
    return null;
  }
  indexClient = new Index({ url, token });
  return indexClient;
}

export async function probeVectorHealth(): Promise<{
  configured: boolean;
  ok: boolean;
  error?: string;
}> {
  if (!isVectorConfigured()) {
    return { configured: false, ok: false, error: 'UPSTASH_VECTOR_* not set' };
  }
  try {
    const index = getVectorIndex();
    if (!index) return { configured: false, ok: false, error: 'client_unavailable' };
    await index.info();
    return { configured: true, ok: true };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
