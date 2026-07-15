import {
  getWhatsAppConfig,
  graphGet,
  isWhatsAppCloudConfigured,
  normalizeWhatsAppTo,
  sendWhatsAppHelloWorld,
  sendWhatsAppText,
} from '@/lib/whatsapp/cloud';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

function authorize(request: Request, bodySecret?: string): boolean {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '';
  if (!expected) return false;
  const secret =
    bodySecret ||
    request.headers.get('x-verify-token') ||
    new URL(request.url).searchParams.get('secret') ||
    '';
  return secret === expected;
}

/**
 * POST /api/whatsapp/diagnose
 * Body: { secret, to?: "0313..." }
 * Checks token + phone number ID, then sends hello_world + a short text.
 */
export async function POST(request: Request) {
  if (!isWhatsAppCloudConfigured()) {
    return Response.json({ ok: false, error: 'Cloud API env not configured' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    secret?: string;
    to?: string;
  } | null;

  if (!authorize(request, body?.secret)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const cfg = getWhatsAppConfig();
  const to = normalizeWhatsAppTo(body?.to || '923138308265');

  const phoneMeta = await graphGet(
    `${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,id`,
  ).catch((e) => ({
    ok: false,
    status: 0,
    data: { error: { message: e instanceof Error ? e.message : 'phone lookup failed' } },
  }));

  const hello = await sendWhatsAppHelloWorld(to);
  const text = await sendWhatsAppText(
    to,
    '*NewsDash Analyst*\n\nDiagnose OK. If you see this, Cloud API delivery works.\n\nNext: message *+1 (555) 058-2326* with: bitcoin price',
  );

  return Response.json({
    ok: hello.ok || text.ok,
    to,
    phoneNumberId: cfg.phoneNumberId,
    phoneMeta: {
      http: phoneMeta.status,
      ok: phoneMeta.ok,
      data: phoneMeta.data,
    },
    helloWorld: {
      ok: hello.ok,
      messageId: hello.messageId,
      error: hello.error,
      graph: hello.graph,
    },
    freeText: {
      ok: text.ok,
      messageId: text.messageId,
      error: text.error,
      graph: text.graph,
    },
    hint: !hello.ok && !text.ok
      ? 'Graph rejected send. Re-add your personal number under Step 1 Recipient and confirm OTP. Generate a fresh access token if expired.'
      : 'API accepted. If phone still empty: search WhatsApp for "555" / unknown chat, confirm you are allowlisted, and Message the test number first.',
  });
}
