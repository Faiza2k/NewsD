import { registerAskCommand } from '@/lib/discord/api';
import { isDiscordConfigured } from '@/lib/discord/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/discord/register
 * Registers the global `/ask` slash command with Discord.
 * Auth: Authorization: Bearer <DISCORD_BOT_TOKEN>  OR  ?token=<DISCORD_BOT_TOKEN>
 */
export async function POST(request: Request) {
  if (!isDiscordConfigured()) {
    return Response.json({ ok: false, error: 'Discord env vars missing' }, { status: 503 });
  }

  const url = new URL(request.url);
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const qToken = url.searchParams.get('token')?.trim();
  const expected = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!expected || (bearer !== expected && qToken !== expected)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await registerAskCommand();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

export async function GET() {
  return Response.json({
    ok: true,
    hint: 'POST with Authorization: Bearer <DISCORD_BOT_TOKEN> to register /ask',
  });
}
