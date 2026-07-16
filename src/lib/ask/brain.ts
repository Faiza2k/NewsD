import { POST as queryPost } from '@/app/api/query/route';
import type { AskQueryRequest, AskQueryResult } from './types';

const FALLBACK_REPLY =
  '*NewsDash Analyst*\n\nCould not answer right now. Please try again.';

/**
 * Run the shared NewsDash Ask brain (same path for WhatsApp and Discord).
 */
export async function runAskQuery(input: AskQueryRequest): Promise<AskQueryResult> {
  const queryRes = await queryPost(
    new Request('http://localhost/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: input.q,
        limit: input.limit ?? 3,
        chatId: input.chatId,
        previousQ: input.previousQ,
        previousIntent: input.previousIntent,
        history: input.history,
        lang: input.lang,
        replyLang: input.replyLang,
      }),
    }),
  );

  const data = (await queryRes.json().catch(() => null)) as AskQueryResult | null;
  if (!data) {
    return { error: 'invalid_json', whatsappText: FALLBACK_REPLY };
  }

  if (!data.whatsappText?.trim()) {
    return { ...data, whatsappText: FALLBACK_REPLY };
  }

  return data;
}

export function getAskFallbackReply(): string {
  return FALLBACK_REPLY;
}
