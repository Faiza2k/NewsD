import { createHmac, timingSafeEqual } from 'crypto';

const GRAPH_VERSION = 'v21.0';

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function getWhatsAppConfig() {
  return {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '',
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || '',
    wabaId: process.env.WHATSAPP_WABA_ID?.trim() || '',
  };
}

/** True when all required send/reply env vars are present. */
export function isWhatsAppCloudConfigured(): boolean {
  const c = getWhatsAppConfig();
  return Boolean(c.verifyToken && c.accessToken && c.phoneNumberId);
}

/** Validate Meta webhook HMAC when WHATSAPP_APP_SECRET is set. */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) return true; // allow early setup before App Secret is added
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice('sha256='.length);
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(digest, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type SendTextResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

async function graphPost(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data, status: res.status };
}

/** Mark inbound message as read (blue ticks). */
export async function markWhatsAppRead(messageId: string): Promise<void> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    if (!phoneNumberId || !accessToken || !messageId) return;
    await graphPost(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  } catch {
    // non-fatal
  }
}

/** Send a plain text WhatsApp message via Cloud API. `to` is digits (country code, no +). */
export async function sendWhatsAppText(to: string, text: string): Promise<SendTextResult> {
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const accessToken = requireEnv('WHATSAPP_ACCESS_TOKEN');
  const cleanedTo = String(to || '').replace(/\D/g, '');
  const body = String(text || '').trim();
  if (!cleanedTo || !body) {
    return { ok: false, error: 'missing to/text' };
  }

  const { ok, data, status } = await graphPost(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanedTo,
    type: 'text',
    text: { preview_url: true, body: body.slice(0, 4096) },
  });

  if (!ok) {
    const err = data.error as { message?: string } | undefined;
    return {
      ok: false,
      error: err?.message || `Graph API ${status}`,
    };
  }

  const messages = data.messages as Array<{ id?: string }> | undefined;
  return { ok: true, messageId: messages?.[0]?.id };
}
