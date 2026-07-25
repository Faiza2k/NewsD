import { runAskQuery } from '@/lib/ask/brain';

export const dynamic = 'force-dynamic';

/**
 * Dashboard AI Assistant — same Ask brain as Discord/WhatsApp (`POST /api/query`).
 * Accepts `{ q, chatId }` (preferred) or legacy `{ messages }` (last user turn).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const messages: Array<{ role?: string; content?: string }> = Array.isArray(body.messages)
      ? body.messages
      : [];
    const fromMessages =
      [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
    const q = (typeof body.q === 'string' ? body.q.trim() : '') || fromMessages;

    if (!q) {
      return Response.json({ error: 'No messages provided' }, { status: 400 });
    }

    const chatId =
      typeof body.chatId === 'string' && body.chatId.trim()
        ? body.chatId.trim()
        : 'dashboard:web';

    const result = await runAskQuery({
      q,
      chatId,
      limit: typeof body.limit === 'number' ? body.limit : 3,
    });

    const content = result.whatsappText?.trim();
    if (!content) {
      return Response.json(
        { error: result.error || 'Ask brain returned an empty reply' },
        { status: 500 },
      );
    }

    return Response.json({
      content,
      mode: 'ask' as const,
      intent: result.intent,
      sourceButtons: result.sourceButtons,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chat failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
