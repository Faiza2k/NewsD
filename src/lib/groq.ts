/**
 * Thin wrapper around the Groq Chat Completions + Audio Transcription APIs.
 * Uses the OpenAI-compatible endpoints.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
/** Heavy grounding / translation model. */
export const GROQ_GROUNDING_MODEL = 'llama-3.3-70b-versatile';
/** Cheap/fast model for classify_turn — keeps TPD headroom for grounding. */
export const GROQ_CLASSIFY_MODEL =
  process.env.GROQ_CLASSIFY_MODEL || 'llama-3.1-8b-instant';
const DEFAULT_MODEL = GROQ_GROUNDING_MODEL;
const DEFAULT_WHISPER_MODEL = 'whisper-large-v3';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 1;

/** Soft daily budget (tokens) for this process — skip non-essential LLM calls when low. */
const SOFT_TPD_BUDGET = Number(process.env.GROQ_SOFT_TPD_BUDGET || 85_000);
let estimatedTokensUsed = 0;
let budgetBlockedUntil = 0;

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type GroqChatErrorCode = '429' | 'no_groq_key' | 'timeout' | 'error';

export class GroqCallError extends Error {
  code: GroqChatErrorCode;
  constructor(message: string, code: GroqChatErrorCode) {
    super(message);
    this.code = code;
  }
}

function requireApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqCallError('GROQ_API_KEY is not set', 'no_groq_key');
  return apiKey;
}

function estimateTokens(messages: GroqMessage[], maxTokens: number): number {
  const chars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  return Math.ceil(chars / 4) + maxTokens;
}

/** True when soft budget says we should skip optional LLM work. */
export function groqBudgetTight(): boolean {
  if (Date.now() < budgetBlockedUntil) return true;
  // After a hard 429 cooldown expires, clear the soft trip so warm
  // serverless instances can use remaining daily quota again.
  if (budgetBlockedUntil > 0 && Date.now() >= budgetBlockedUntil) {
    budgetBlockedUntil = 0;
    if (estimatedTokensUsed >= SOFT_TPD_BUDGET) {
      estimatedTokensUsed = Math.floor(SOFT_TPD_BUDGET * 0.5);
    }
  }
  return estimatedTokensUsed >= SOFT_TPD_BUDGET;
}

export function groqBudgetRemaining(): number {
  return Math.max(0, SOFT_TPD_BUDGET - estimatedTokensUsed);
}

function noteUsage(est: number): void {
  estimatedTokensUsed += est;
}

function parseRateLimitWaitMs(body: string): number {
  const m = body.match(/try again in ([\d.]+)(m|s|h)/i);
  if (!m) return 60_000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'h') return Math.ceil(n * 3_600_000);
  if (unit === 'm') return Math.ceil(n * 60_000);
  return Math.ceil(n * 1000);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function groqChat(
  messages: GroqMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    retries?: number;
    /** When true, skip call if soft TPD budget is exhausted (classify/summarize). */
    skipIfBudgetTight?: boolean;
  },
): Promise<string> {
  if (options?.skipIfBudgetTight && groqBudgetTight()) {
    throw new GroqCallError('Groq soft TPD budget exhausted', '429');
  }

  const apiKey = requireApiKey();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.min(Math.max(options?.retries ?? DEFAULT_RETRIES, 0), 2);
  const maxTokens = options?.maxTokens ?? 800;
  const model = options?.model ?? DEFAULT_MODEL;
  const est = estimateTokens(messages, maxTokens);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        GROQ_API_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature: options?.temperature ?? 0.3,
          }),
        },
        timeoutMs,
      );

      if (response.status === 429 || response.status >= 500) {
        const errBody = await response.text();
        if (response.status === 429) {
          const wait = parseRateLimitWaitMs(errBody);
          // Cooldown only — do not permanently trip soft TPD on this warm instance.
          budgetBlockedUntil = Math.max(budgetBlockedUntil, Date.now() + Math.min(wait, 3_600_000));
          lastError = new GroqCallError(`Groq API error 429: ${errBody}`, '429');
        } else {
          lastError = new GroqCallError(`Groq API error ${response.status}: ${errBody}`, 'error');
        }
        if (attempt < retries && response.status >= 500) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const err = await response.text();
        throw new GroqCallError(`Groq API error ${response.status}: ${err}`, 'error');
      }

      const data = await response.json();
      noteUsage(est);
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (err) {
      lastError = err;
      if (err instanceof GroqCallError) throw err;
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (attempt < retries && (aborted || /5\d\d/.test(String(err)))) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      if (aborted) throw new GroqCallError(`Groq API timeout after ${timeoutMs}ms`, 'timeout');
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export type GroqTranscription = {
  text: string;
  language?: string;
};

/** Transcribe audio via Groq Whisper (OpenAI-compatible multipart). */
export async function groqTranscribe(
  audio: Buffer,
  filename: string,
  mime?: string,
  options?: { model?: string; language?: string; timeoutMs?: number },
): Promise<GroqTranscription> {
  const apiKey = requireApiKey();
  const form = new FormData();
  const type = mime || 'application/octet-stream';
  const blob = new Blob([new Uint8Array(audio)], { type });
  form.append('file', blob, filename || 'audio.ogg');
  form.append('model', options?.model ?? DEFAULT_WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  if (options?.language) form.append('language', options.language);

  const response = await fetchWithTimeout(
    GROQ_TRANSCRIBE_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    },
    options?.timeoutMs ?? 30_000,
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq transcription error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    text?: string;
    language?: string;
  };
  return {
    text: String(data.text || '').trim(),
    language: data.language ? String(data.language) : undefined,
  };
}
