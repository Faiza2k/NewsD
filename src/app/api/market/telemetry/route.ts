import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

import { getCached, setCache } from '@/lib/feeds/cache';

const CACHE_TTL = 15 * 60 * 1000;

export interface MarketTelemetry {
  crypto: Record<string, { usd: number; usd_24h_change?: number }>;
  forex: { rates?: Record<string, number>; base?: string } | null;
  metals: Record<string, { price?: number; ch?: number }>;
  lastUpdated: string;
}

export async function GET() {
  const cacheKey = 'market:telemetry:v1';
  const cached = getCached<MarketTelemetry>(cacheKey);
  if (cached) return Response.json(cached);

  const telemetry: MarketTelemetry = {
    crypto: {},
    forex: null,
    metals: {},
    lastUpdated: new Date().toISOString(),
  };

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' }, next: { revalidate: 120 } }
    );
    if (res.ok) telemetry.crypto = await res.json();
  } catch (e) {
    console.warn('[Market telemetry] CoinGecko failed:', e);
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (res.ok) telemetry.forex = await res.json();
  } catch (e) {
    console.warn('[Market telemetry] Forex failed:', e);
  }

  for (const sym of ['XAU', 'XAG'] as const) {
    try {
      const res = await fetch(`https://api.gold-api.com/price/${sym}`, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      });
      if (res.ok) telemetry.metals[sym] = await res.json();
    } catch (e) {
      console.warn(`[Market telemetry] ${sym} failed:`, e);
    }
  }

  setCache(cacheKey, telemetry, CACHE_TTL);
  return Response.json(telemetry);
}
