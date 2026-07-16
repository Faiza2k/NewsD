import { groqChat, type GroqMessage } from '@/lib/groq';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are NewsDash Analyst — a smart, helpful assistant for a Pakistani news service.

Language rules (MANDATORY):
- If the user writes in Urdu (Roman script or Nastaliq/Arabic script), respond FULLY in Urdu using the same script they used.
- Do NOT output any Chinese, Japanese, or other non-Urdu/non-English characters under any circumstances (e.g. do not write "安排وں" or "交通").
- If you need to write an English term, name, or concept that does not translate easily to Urdu, either write it in Urdu transliteration (e.g., "ٹریفک" or "ارینجمنٹس") or use the standard English word in Latin letters.
- If the user writes in English, respond FULLY in English.
- If the user mixes both languages (code-switching), match their mixed style naturally.
- Never translate between scripts unless the user explicitly asks.

Behaviour:
- Use the news context provided (if any) to ground your answer with real headlines.
- If news context is not relevant or absent, answer from general knowledge.
- Keep answers concise: max 4–5 sentences or a short bullet list.
- Format for WhatsApp: use *bold* for key terms. Avoid markdown headings (#).
- Always start your reply with *NewsDash Analyst* on the first line only.`;

type ChatRequest = {
  q: string;
  history?: GroqMessage[];
  newsContext?: string; // pre-formatted text from /api/query result
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as ChatRequest | null;

    if (!body?.q || typeof body.q !== 'string' || body.q.trim().length < 1) {
      return Response.json({ error: 'Field `q` (question) is required.' }, { status: 400 });
    }

    const q = body.q.trim();
    const history: GroqMessage[] = Array.isArray(body.history) ? body.history.slice(-40) : [];
    const newsContext = typeof body.newsContext === 'string' ? body.newsContext.trim() : '';

    const systemContent = newsContext
      ? `${SYSTEM_PROMPT}\n\nRelevant news context (use this to ground your answer):\n${newsContext}`
      : SYSTEM_PROMPT;

    const messages: GroqMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: q },
    ];

    const text = await groqChat(messages, {
      maxTokens: 512,
      temperature: 0.4,
    });

    if (!text) {
      return Response.json(
        { error: 'No response from model. Please try again.' },
        { status: 502 },
      );
    }

    return Response.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    const missingKey = /GROQ_API_KEY/i.test(message);
    return Response.json(
      {
        error: missingKey ? 'AI chat is not configured.' : 'Could not generate a response.',
        detail: message,
      },
      { status: missingKey ? 503 : 502 },
    );
  }
}
