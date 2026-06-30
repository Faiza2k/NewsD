import { getCached, setCache } from '@/lib/feeds/cache';
import type { CryptoAsset } from '@/types';

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

export async function GET() {
  const cacheKey = 'crypto:market';
  const cached = getCached<CryptoAsset[]>(cacheKey);

  if (cached) {
    return Response.json({
      assets: cached,
      lastUpdated: new Date().toISOString(),
    });
  }

  try {
    const response = await fetch(
      `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=24h`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 120 },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data: CryptoAsset[] = await response.json();

    const assets: CryptoAsset[] = data.map((coin) => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      image: coin.image,
      current_price: coin.current_price,
      price_change_percentage_24h: coin.price_change_percentage_24h,
      market_cap: coin.market_cap,
      total_volume: coin.total_volume,
      sparkline_in_7d: coin.sparkline_in_7d,
      market_cap_rank: coin.market_cap_rank,
    }));

    setCache(cacheKey, assets, CACHE_TTL);

    return Response.json({
      assets,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Crypto API] Error:', error);

    // Return fallback data
    return Response.json({
      assets: [],
      lastUpdated: new Date().toISOString(),
      error: 'Failed to fetch crypto market data',
    }, { status: 200 });
  }
}
