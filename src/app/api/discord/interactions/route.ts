import { discordChatId } from '@/lib/ask/chat-id';
import { getAskFallbackReply, runAskQuery } from '@/lib/ask/brain';
import { deferInteraction, editOriginalInteraction } from '@/lib/discord/api';
import { getDiscordConfig, isDiscordConfigured, isGuildAllowed } from '@/lib/discord/config';
import { verifyDiscordSignature } from '@/lib/discord/verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Query + Discord follow-up within one invocation after defer. */
export const maxDuration = 60;

type DiscordOption = {
  name?: string;
  type?: number;
  value?: string | number | boolean;
};

type DiscordInteraction = {
  id?: string;
  token?: string;
  type?: number;
  guild_id?: string;
  channel_id?: string;
  data?: {
    name?: string;
    options?: DiscordOption[];
  };
  member?: { user?: { id?: string; username?: string } };
  user?: { id?: string; username?: string };
};

/**
 * GET — health / config check (no secrets).
 */
export async function GET() {
  const c = getDiscordConfig();
  return Response.json({
    ok: true,
    service: 'NewsDash Discord Ask',
    channel: 'discord',
    configured: isDiscordConfigured(),
    hasPublicKey: Boolean(c.publicKey),
    publicKeyPrefix: c.publicKey ? c.publicKey.slice(0, 6) + '...' + c.publicKey.slice(-6) : '',
    hasBotToken: Boolean(c.botToken),
    hasApplicationId: Boolean(c.applicationId),
    allowedGuilds: c.allowedGuildIds.length || 'all',
    dualChannel: 'Works alongside WhatsApp WAHA — see DUAL_CHANNEL_SETUP.md',
    hint: isDiscordConfigured()
      ? 'Set Interactions Endpoint URL to https://news-d.vercel.app/api/discord/interactions then /ask in Discord.'
      : 'Add DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID on Vercel.',
  });
}

/**
 * POST — Discord Interactions Endpoint.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const { publicKey } = getDiscordConfig();

  if (!publicKey) {
    return new Response('Discord not configured', { status: 503 });
  }

  if (!verifyDiscordSignature(publicKey, signature, timestamp, rawBody)) {
    console.error('[discord] invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  if (interaction.type === 1) {
    return Response.json({ type: 1 });
  }

  if (interaction.type === 2) {
    const name = interaction.data?.name || '';
    if (name !== 'ask') {
      return Response.json({
        type: 4,
        data: { content: 'Unknown command. Use `/ask`.', flags: 64 },
      });
    }

    if (!isGuildAllowed(interaction.guild_id)) {
      return Response.json({
        type: 4,
        data: { content: 'This server is not allowed to use NewsDash Ask.', flags: 64 },
      });
    }

    if (!isDiscordConfigured() || !interaction.id || !interaction.token) {
      return Response.json({
        type: 4,
        data: { content: 'NewsDash Discord is not fully configured yet.', flags: 64 },
      });
    }

    const question = extractQuestion(interaction);
    if (!question) {
      return Response.json({
        type: 4,
        data: {
          content: 'Please include a question. Example: `/ask question: bitcoin price`',
          flags: 64,
        },
      });
    }

    // Defer first so Discord shows "NewsDash is thinking…"
    const deferred = await deferInteraction(interaction.id, interaction.token);
    if (!deferred) {
      return Response.json({
        type: 4,
        data: { content: 'Could not start reply. Please try again.', flags: 64 },
      });
    }

    // answerAsk MUST be awaited before we return — Vercel kills the invocation
    // as soon as the HTTP response is sent, so any work after the return is lost.
    console.log('[discord] deferred ok, running brain for:', question);
    try {
      await answerAsk(interaction, question);
      console.log('[discord] brain done, reply sent');
    } catch (err) {
      console.error('[discord] answer failed', err);
      const { applicationId } = getDiscordConfig();
      await editOriginalInteraction(
        applicationId,
        interaction.token,
        '**NewsDash Analyst**\n\nSomething went wrong answering that. Please try again in a moment.',
      ).catch(() => null);
    }

    return new Response(null, { status: 200 });
  }

  return Response.json({
    type: 4,
    data: { content: 'Unsupported interaction.', flags: 64 },
  });
}

function extractQuestion(interaction: DiscordInteraction): string {
  const opts = interaction.data?.options || [];
  const q = opts.find((o) => o.name === 'question');
  const value = q?.value != null ? String(q.value).trim() : '';
  return value.length >= 2 ? value : '';
}

async function answerAsk(interaction: DiscordInteraction, question: string) {
  const { applicationId } = getDiscordConfig();
  const token = interaction.token!;

  console.log('[discord] calling runAskQuery, q:', question);
  const data = await runAskQuery({
    q: question,
    limit: 3,
    chatId: discordChatId({
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
      userId: interaction.member?.user?.id || interaction.user?.id,
    }),
  });

  console.log('[discord] runAskQuery done, intent:', (data as any).intent, 'hasText:', Boolean(data.whatsappText));
  const reply = data.whatsappText?.trim() || getAskFallbackReply();
  const sent = await editOriginalInteraction(applicationId, token, reply, data.sourceButtons);
  if (!sent.ok) {
    console.error('[discord] edit failed', sent.error);
  }
}
