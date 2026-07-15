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
  };
}

/** Validate Meta webhook HMAC when WHATSAPP_APP_SECRET is set. */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) return true; // optional in early setup
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

/** Send a plain text WhatsApp message via Cloud API. `to` is digits only (country code, no +). */
export async function sendWhatsAppText(to: string, text: string): Promise<SendTextResult> {
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const accessToken = requireEnv('WHATSAPP_ACCESS_TOKEN');
  const cleanedTo = String(to || '').replace(/\D/g, '');
  const body = String(text || '').trim();
  if (!cleanedTo || !body) {
    return { ok: false, error: 'missing to/text' };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanedTo,
      type: 'text',
      text: { preview_url: true, body: body.slice(0, 4096) },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.message || `Graph API ${res.status}`,
    };
  }

  return { ok: true, messageId: data.messages?.[0]?.id };
}
