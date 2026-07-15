import { sendWhatsAppText, isWhatsAppCloudConfigured } from '@/lib/whatsapp/cloud';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/whatsapp/test-send
 * Body: { to: "92313...", text?: "hello" }
 * Protected by WHATSAPP_VERIFY_TOKEN as `secret` in body or `x-verify-token` header.
 */
export async function POST(request: Request) {
  if (!isWhatsAppCloudConfigured()) {
    return Response.json({ ok: false, error: 'Cloud API not configured on Vercel' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    to?: string;
    text?: string;
    secret?: string;
  } | null;

  const secret =
    body?.secret ||
    request.headers.get('x-verify-token') ||
    new URL(request.url).searchParams.get('secret') ||
    '';
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '';
  if (!expected || secret !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const to = String(body?.to || '').replace(/\D/g, '');
  if (!to) {
    return Response.json({ ok: false, error: 'Provide `to` phone (digits with country code)' }, { status: 400 });
  }

  const text =
    String(body?.text || '').trim() ||
    '*NewsDash Analyst*\n\nCloud API test OK. Ask me anything, e.g. bitcoin price.';

  const sent = await sendWhatsAppText(to, text);
  return Response.json({
    ok: sent.ok,
    messageId: sent.messageId,
    error: sent.error,
    to,
  });
}
