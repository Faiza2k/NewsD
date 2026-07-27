import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getCached, invalidateCache, setCache } from '@/lib/feeds/cache';
import { getAllFeedItems, getFeedItemsForQuery } from '@/lib/feeds/fetch-all-feeds';
import { getFeedsForModule, isIntelligenceModule } from '@/lib/feeds/module-feeds';
import { startBackgroundIngest } from '@/lib/rag/ingest';
import type { Category, NewsItem } from '@/types';

const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') as Category | null;
  const moduleId = searchParams.get('module');
  const force = searchParams.get('force') === '1';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  const cacheKey = `feeds_v6:${moduleId || category || 'all'}`;
  const cached = force ? null : getCached<NewsItem[]>(cacheKey);

  if (cached) {
    // Keep the vector corpus warm even when HTTP cache hits.
    startBackgroundIngest(cached);
    return Response.json({
      items: cached.slice(offset, offset + limit),
      total: cached.length,
      lastUpdated: new Date().toISOString(),
      category,
    });
  }

  if (force) {
    invalidateCache('feeds_v6:');
  }

  // Shared ingestion path (also kicks hybrid RAG background ingest).
  const all = force ? await getAllFeedItems(true) : await getFeedItemsForQuery();

  let processed = all;
  if (moduleId && isIntelligenceModule(moduleId)) {
    const allowed = new Set(getFeedsForModule(moduleId).map((f) => f.name));
    processed = all.filter((i) => allowed.has(i.source) || getFeedsForModule(moduleId).some((f) => f.category === i.category));
  } else if (category) {
    processed = all.filter((i) => i.category === category);
  }

  setCache(cacheKey, processed, CACHE_TTL);

  return Response.json({
    items: processed.slice(offset, offset + limit),
    total: processed.length,
    lastUpdated: new Date().toISOString(),
    category,
  });
}
