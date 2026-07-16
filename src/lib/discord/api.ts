import { getDiscordConfig } from './config';
import { chunkDiscordContent, sourceButtonsToComponents, whatsappToDiscordMarkdown, type SourceButton } from './format';

const API = 'https://discord.com/api/v10';

/**
 * ACK an interaction as deferred via the Callback API so we can keep
 * working in the same Vercel invocation (Discord's HTTP response can then
 * just be 200). Prefer this over `after()` which Vercel often truncates.
 */
export async function deferInteraction(interactionId: string, token: string): Promise<boolean> {
  const res = await fetch(`${API}/interactions/${interactionId}/${token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 5 }), // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[discord] defer failed', res.status, err.slice(0, 300));
    return false;
  }
  return true;
}

export async function editOriginalInteraction(
  applicationId: string,
  token: string,
  content: string,
  sourceButtons?: SourceButton[],
): Promise<{ ok: boolean; error?: string }> {
  const chunks = chunkDiscordContent(whatsappToDiscordMarkdown(content));
  const components = sourceButtonsToComponents(sourceButtons);

  const firstBody: Record<string, unknown> = {
    content: chunks[0],
  };
  if (components) firstBody.components = components;

  const res = await fetch(`${API}/webhooks/${applicationId}/${token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(firstBody),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${err.slice(0, 300)}` };
  }

  // Extra chunks as follow-up messages (no components)
  for (let i = 1; i < chunks.length; i++) {
    await fetch(`${API}/webhooks/${applicationId}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: chunks[i] }),
    }).catch(() => null);
  }

  return { ok: true };
}

/** Register (or update) the global /ask slash command. */
export async function registerAskCommand(): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  const { botToken, applicationId } = getDiscordConfig();
  if (!botToken || !applicationId) {
    return { ok: false, status: 0, data: { error: 'Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID' } };
  }

  const res = await fetch(`${API}/applications/${applicationId}/commands`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'ask',
      description: 'Ask NewsDash about news, gold, crypto, or fuel prices',
      options: [
        {
          type: 3, // STRING
          name: 'question',
          description: 'Your question (e.g. bitcoin price, diesel price, US Iran)',
          required: true,
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
