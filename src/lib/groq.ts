/**
 * Thin wrapper around the Groq Chat Completions API.
 * Uses the OpenAI-compatible endpoint.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function groqChat(
  messages: GroqMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
