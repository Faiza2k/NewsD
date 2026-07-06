import { groqChat, type GroqMessage } from '@/lib/groq';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages: GroqMessage[] = body.messages ?? [];

    if (!messages.length) {
      return Response.json({ error: 'No messages provided' }, { status: 400 });
    }

    const system: GroqMessage = {
      role: 'system',
      content:
        'You are NewsDash AI — a concise intelligence analyst. Answer questions about news, markets, crypto, AI, and technology clearly in plain language. Keep responses under 200 words unless the user asks for detail.',
    };

    const content = await groqChat([system, ...messages], {
      maxTokens: 600,
      temperature: 0.4,
    });

    return Response.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chat failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
