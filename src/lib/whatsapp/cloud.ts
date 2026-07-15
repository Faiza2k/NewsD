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
  /** Full Graph error / response for diagnostics (no secrets). */
  graph?: Record<string, unknown>;
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

export async function graphGet(
  path: string,
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const accessToken = requireEnv('WHATSAPP_ACCESS_TOKEN');
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
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

/** Normalize to E.164 digits without +, then send with leading + (Meta best practice). */
export function normalizeWhatsAppTo(to: string): string {
  let digits = String(to || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    digits = `92${digits.slice(1)}`;
  }
  // strip accidental leading 00
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}

function toE164(to: string): string {
  const digits = normalizeWhatsAppTo(to);
  return digits ? `+${digits}` : '';
}

/** Send a plain text WhatsApp message via Cloud API. `to` is digits (country code, no +). */
export async function sendWhatsAppText(to: string, text: string): Promise<SendTextResult> {
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const accessToken = requireEnv('WHATSAPP_ACCESS_TOKEN');
  const cleanedTo = toE164(to);
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
    const err = data.error as { message?: string; code?: number; error_data?: unknown } | undefined;
    return {
      ok: false,
      error: err?.message || `Graph API ${status}`,
      graph: data,
    };
  }

  const messages = data.messages as Array<{ id?: string }> | undefined;
  return { ok: true, messageId: messages?.[0]?.id, graph: data };
}

/**
 * Meta's default sandbox template — often delivers when free-form text does not
 * (first contact / outside the customer-care window).
 */
export async function sendWhatsAppHelloWorld(to: string): Promise<SendTextResult> {
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const accessToken = requireEnv('WHATSAPP_ACCESS_TOKEN');
  const cleanedTo = toE164(to);
  if (!cleanedTo) return { ok: false, error: 'missing to' };

  const { ok, data, status } = await graphPost(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: cleanedTo,
    type: 'template',
    template: {
      name: 'hello_world',
      language: { code: 'en_US' },
    },
  });

  const messages = data.messages as Array<{ id?: string }> | undefined;
  return { ok: true, messageId: messages?.[0]?.id, graph: data };
}

/**
 * Ensure the app is subscribed to this WABA's webhooks (required for inbound).
 * POST /{waba-id}/subscribed_apps
 */
export async function subscribeAppToWaba(): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}> {
  const wabaId = process.env.WHATSAPP_WABA_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!wabaId || !accessToken) {
    return { ok: false, status: 0, data: { error: 'Missing WHATSAPP_WABA_ID or token' } };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
