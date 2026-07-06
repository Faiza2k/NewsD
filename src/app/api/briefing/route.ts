import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

import { getAllFeedItems } from '@/lib/feeds/fetch-all-feeds';
import { buildDailyBriefing, type DailyBriefing } from '@/lib/briefing/build-briefing';
import { getCached, setCache } from '@/lib/feeds/cache';

const BRIEFING_CACHE_KEY = 'daily-briefing:v1';
const BRIEFING_CACHE_TTL = 3 * 60 * 1000;

export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === '1';

  if (!force) {
    const cached = getCached<DailyBriefing>(BRIEFING_CACHE_KEY);
    if (cached) return Response.json(cached);
  }

  const items = await getAllFeedItems(force);
  const briefing = buildDailyBriefing(items);
  setCache(BRIEFING_CACHE_KEY, briefing, BRIEFING_CACHE_TTL);

  return Response.json(briefing);
}
