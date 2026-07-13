/**
 * Thin wrapper around the Groq Chat Completions + Audio Transcription APIs.
 * Uses the OpenAI-compatible endpoints.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_WHISPER_MODEL = 'whisper-large-v3';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function requireApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');
  return apiKey;
}

export async function groqChat(
  messages: GroqMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  const apiKey = requireApiKey();

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options?.model ?? DEFAULT_MODEL,
      messages,
      max_tokens: options?.maxTokens ?? 800,
      temperature: options?.temperature ?? 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
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
  options?: { model?: string; language?: string },
): Promise<GroqTranscription> {
  const apiKey = requireApiKey();
  const form = new FormData();
  const type = mime || 'application/octet-stream';
  const blob = new Blob([new Uint8Array(audio)], { type });
  form.append('file', blob, filename || 'audio.ogg');
  form.append('model', options?.model ?? DEFAULT_WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  if (options?.language) form.append('language', options.language);

  const response = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

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
