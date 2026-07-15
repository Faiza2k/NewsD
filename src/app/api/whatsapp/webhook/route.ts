import { POST as queryPost } from '@/app/api/query/route';
import {
  getWhatsAppConfig,
  isWhatsAppCloudConfigured,
  markWhatsAppRead,
  sendWhatsAppText,
  verifyWhatsAppSignature,
} from '@/lib/whatsapp/cloud';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Allow query + Graph send before Meta's webhook timeout. */
export const maxDuration = 60;

type InboundText = {
  from: string;
  messageId: string;
  text: string;
};

type WaMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
};

type WaValue = {
  messages?: WaMessage[];
  statuses?: unknown[];
  metadata?: { phone_number_id?: string; display_phone_number?: string };
};

/**
 * GET — Meta webhook verification (subscribe challenge).
 * Also returns a tiny JSON status when opened in a browser without hub.* params
 * so we can confirm the route is deployed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const { verifyToken } = getWhatsAppConfig();

  if (mode === 'subscribe' && challenge) {
    if (verifyToken && token === verifyToken) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // Browser / health check (does not leak secrets)
  return Response.json({
    ok: true,
    service: 'NewsDash WhatsApp Cloud API webhook',
    configured: isWhatsAppCloudConfigured(),
    hasVerifyToken: Boolean(verifyToken),
    hasAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
    hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
    hasAppSecret: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
    hint: isWhatsAppCloudConfigured()
      ? 'Ready. Configure Meta webhook to this URL and message the test number.'
      : 'Add WHATSAPP_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID on Vercel.',
  });
}

/** POST — inbound WhatsApp Cloud API events. ACK fast; answer in after(). */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyWhatsAppSignature(rawBody, signature)) {
    console.error('[whatsapp webhook] invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  console.log(
    '[whatsapp webhook] hit',
    JSON.stringify({
      hasMessages: /"messages"\s*:/.test(rawBody),
      hasStatuses: /"statuses"\s*:/.test(rawBody),
      bytes: rawBody.length,
    }),
  );

  // Log delivery failures (accepted ≠ delivered)
  try {
    const root = payload as {
      entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<Record<string, unknown>> } }> }>;
    };
    for (const entry of root.entry || []) {
      for (const change of entry.changes || []) {
        for (const st of change.value?.statuses || []) {
          console.log('[whatsapp status]', JSON.stringify(st));
        }
      }
    }
  } catch {
    // ignore
  }

  const messages = extractInboundTexts(payload);
  console.log('[whatsapp webhook] inbound texts', messages.length, messages.map((m) => m.from));
  if (messages.length) {
    // Await replies here — Vercel often kills `after()` before Graph API send finishes.
    for (const msg of messages) {
      try {
        await replyToUser(msg);
      } catch (err) {
        console.error('[whatsapp webhook] reply failed', msg.messageId, err);
        try {
          await sendWhatsAppText(
            msg.from,
            '*NewsDash Analyst*\n\nSomething went wrong answering that. Please try again in a moment.',
          );
        } catch {
          // ignore
        }
      }
    }
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}

function extractInboundTexts(payload: unknown): InboundText[] {
  const root = payload as {
    object?: string;
    entry?: Array<{ changes?: Array<{ field?: string; value?: WaValue }> }>;
  };

  if (root.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) {
    return [];
  }

  const out: InboundText[] = [];
  for (const entry of root.entry) {
    for (const change of entry.changes || []) {
      if (change.field && change.field !== 'messages') continue;
      const value = change.value;
      if (!value?.messages?.length) continue;

      for (const m of value.messages) {
        if (!m?.from || !m.id) continue;
        if (m.type !== 'text') {
          // Phase 1: text only — soft nudge for voice/media
          if (m.type === 'audio' || m.type === 'image' || m.type === 'video' || m.type === 'document') {
            out.push({
              from: m.from,
              messageId: m.id,
              text: '__UNSUPPORTED_MEDIA__',
            });
          }
          continue;
        }
        const text = String(m.text?.body || '').trim();
        if (text.length < 2) continue;
        if (text.startsWith('*NewsDash Analyst*') || text.startsWith('NewsDash Analyst')) {
          continue;
        }
        out.push({ from: m.from, messageId: m.id, text });
      }
    }
  }
  return out;
}

async function replyToUser(msg: InboundText) {
  if (!isWhatsAppCloudConfigured()) {
    console.error('[whatsapp webhook] Cloud API env vars missing');
    return;
  }

  await markWhatsAppRead(msg.messageId);

  if (msg.text === '__UNSUPPORTED_MEDIA__') {
    await sendWhatsAppText(
      msg.from,
      '*NewsDash Analyst*\n\nPlease send a *text* question for now (voice coming soon).\n\nTry: bitcoin price · gold price · diesel price · US iran war',
    );
    return;
  }

  // chatId = WhatsApp user phone (digits) — powers expert session memory on Vercel
  const queryRes = await queryPost(
    new Request('http://localhost/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: msg.text,
        limit: 3,
        chatId: msg.from,
      }),
    }),
  );

  const data = (await queryRes.json().catch(() => null)) as {
    whatsappText?: string;
    error?: string;
  } | null;

  const reply =
    (data?.whatsappText && String(data.whatsappText).trim()) ||
    '*NewsDash Analyst*\n\nCould not answer right now. Please try again.';

  const sent = await sendWhatsAppText(msg.from, reply);
  if (!sent.ok) {
    console.error('[whatsapp webhook] send failed', msg.messageId, sent.error);
  }
}
