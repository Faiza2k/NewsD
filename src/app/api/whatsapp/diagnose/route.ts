import {
  getWhatsAppConfig,
  graphGet,
  isWhatsAppCloudConfigured,
  normalizeWhatsAppTo,
  sendWhatsAppHelloWorld,
  sendWhatsAppText,
  subscribeAppToWaba,
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

  const subscribed = await subscribeAppToWaba();

  const phoneMeta = await graphGet(
    `${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,id`,
  ).catch((e) => ({
    ok: false,
    status: 0,
    data: { error: { message: e instanceof Error ? e.message : 'phone lookup failed' } },
  }));

  let subscribedApps: { ok: boolean; status: number; data: Record<string, unknown> } = {
    ok: false,
    status: 0,
    data: {},
  };
  if (cfg.wabaId) {
    subscribedApps = await graphGet(`${cfg.wabaId}/subscribed_apps`);
  }

  const hello = await sendWhatsAppHelloWorld(to);
  const text = await sendWhatsAppText(
    to,
    '*NewsDash Analyst*\n\nDiagnose OK (E.164). If you see this, delivery works.\n\nMessage +1 (555) 058-2326 with: bitcoin price',
  );

  return Response.json({
    ok: hello.ok || text.ok,
    to: `+${to}`,
    phoneNumberId: cfg.phoneNumberId,
    wabaId: cfg.wabaId || null,
    subscribeAppToWaba: subscribed,
    subscribedAppsList: subscribedApps,
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
    critical:
      'If Vercel has no POST /api/whatsapp/webhook from Meta, inbound is not wired. Fix messages subscription + WABA subscribed_apps on the TEST account.',
  });
}
