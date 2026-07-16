import { getAskChannelStatus } from '@/lib/ask/channels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/ask/status — unified health for WhatsApp + Discord Ask channels.
 */
export async function GET() {
  const status = getAskChannelStatus();
  return Response.json({
    ok: true,
    service: 'NewsDash Ask (dual-channel)',
    ...status,
    setupGuide: 'See DUAL_CHANNEL_SETUP.md',
  });
}
