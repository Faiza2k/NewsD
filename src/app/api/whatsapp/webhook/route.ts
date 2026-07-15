import { after } from 'next/server';
import { POST as queryPost } from '@/app/api/query/route';
import {
  getWhatsAppConfig,
  sendWhatsAppText,
  verifyWhatsAppSignature,
} from '@/lib/whatsapp/cloud';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
};

/** Meta webhook verification (subscribe challenge). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const { verifyToken } = getWhatsAppConfig();

  if (mode === 'subscribe' && challenge && verifyToken && token === verifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response('Forbidden', { status: 403 });
}

/** Inbound WhatsApp Cloud API events. ACK fast; answer in after(). */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyWhatsAppSignature(rawBody, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const messages = extractInboundTexts(payload);
  if (messages.length) {
    after(async () => {
      for (const msg of messages) {
        try {
          await replyToUser(msg);
        } catch (err) {
          console.error('[whatsapp webhook] reply failed', msg.messageId, err);
        }
      }
    });
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
        if (m.type !== 'text') continue; // phase 1: text only
        const text = String(m.text?.body || '').trim();
        if (text.length < 2) continue;
        // Ignore echo of our own analyst branding loops
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
  const { accessToken, phoneNumberId } = getWhatsAppConfig();
  if (!accessToken || !phoneNumberId) {
    console.error('[whatsapp webhook] missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    return;
  }

  const queryRes = await queryPost(
    new Request('http://localhost/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: msg.text, limit: 3, chatId: msg.from }),
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
