import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
import { getCached, invalidateCache, setCache } from '@/lib/feeds/cache';
import { FEED_SOURCES } from '@/lib/feeds/registry';
import { getAllFeedItems } from '@/lib/feeds/fetch-all-feeds';
import { getFeedsForModule, isIntelligenceModule } from '@/lib/feeds/module-feeds';
import { scoreSignificance, deduplicateByUrl, deduplicateByTitle } from '@/lib/utils/relevance-scorer';
import { extractValidDate, isFresh } from '@/lib/feeds/date-utils';
import type { NewsItem, Category } from '@/types';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 6000,
  headers: {
    'User-Agent': 'NewsDash/1.0 Intelligence Dashboard',
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
  },
  maxRedirects: 3,
  customFields: {
    item: [
      ['dc:date', 'dcDate'],
      ['published', 'published'],
      ['updated', 'updated'],
      ['date', 'date'],
    ],
  },
});

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BOOTSTRAP_CACHE_TTL = 60 * 1000; // fast first paint, then full cache overwrites
const BATCH_SIZE = 8;
const MAX_ITEMS_PER_FEED = 8;
const FEED_TIMEOUT_MS = 3500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

interface RSSItem {
  title?: string;
  link?: string;
  contentSnippet?: string;
  content?: string;
  isoDate?: string;
  pubDate?: string;
  creator?: string;
  categories?: string[];
}

async function fetchSingleFeed(source: typeof FEED_SOURCES[number]): Promise<NewsItem[]> {
  try {
    const feed = await withTimeout(parser.parseURL(source.url), FEED_TIMEOUT_MS);
    const items: NewsItem[] = [];

    for (const item of (feed.items || []).slice(0, MAX_ITEMS_PER_FEED)) {
      const rssItem = item as RSSItem;
      const title = rssItem.title?.trim() || '';
      const description = rssItem.contentSnippet?.trim() || rssItem.content?.replace(/<[^>]*>/g, '').trim() || '';
      const url = rssItem.link || '';

      // Never fabricate freshness: require a real, verifiable publish date.
      const publishedAt = extractValidDate(item as unknown as Record<string, unknown>);
      if (!title || !url || !publishedAt || !isFresh(publishedAt)) continue;

      const significance = scoreSignificance(title, description, source.category, publishedAt, source.category);

      // Use full base64 encoding of the URL to ensure it is 100% unique, avoiding collisions from shared query params
      const urlHash = Buffer.from(url).toString('base64');

      items.push({
        id: `${source.id}-${urlHash}`,
        title,
        description: description.slice(0, 300),
        url,
        source: source.name,
        category: source.category,
        subcategory: source.subcategories[0],
        publishedAt,
        significance,
        tags: source.subcategories,
      });
    }

    return items;
  } catch (error) {
    // Silently handle RSS fetch errors to avoid console spam
    return [];
  }
}

async function fetchFeedsBatch(sources: typeof FEED_SOURCES): Promise<NewsItem[]> {
  const allItems: NewsItem[] = [];

  // Process in batches for concurrency control
  for (let i = 0; i < sources.length; i += BATCH_SIZE) {
    const batch = sources.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchSingleFeed));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }
  }

  return allItems;
}

async function fetchFeedsUntil(sources: typeof FEED_SOURCES, targetItemCount: number): Promise<NewsItem[]> {
  const allItems: NewsItem[] = [];

  for (let i = 0; i < sources.length; i += BATCH_SIZE) {
    const batch = sources.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchSingleFeed));
    for (const result of results) {
      if (result.status === 'fulfilled') allItems.push(...result.value);
    }
    if (allItems.length >= targetItemCount) break;
  }

  return allItems;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') as Category | null;
  const moduleId = searchParams.get('module');
  const force = searchParams.get('force') === '1';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  const cacheKey = `feeds_v5:${moduleId || category || 'all'}`;
  const cached = force ? null : getCached<NewsItem[]>(cacheKey);

  if (cached) {
    const paginated = cached.slice(offset, offset + limit);
    return Response.json({
      items: paginated,
      total: cached.length,
      lastUpdated: new Date().toISOString(),
      category,
    });
  }

  if (force) {
    // Clear cached feeds so the next requests also reflect fresh data.
    // (We still keep the response fast via time-bounded RSS fetches.)
    invalidateCache('feeds_v5:');
  }

  // Warm full cache in the background so future loads are fast.
  // This avoids a "long synchronizing" experience on the very first run.
  void getAllFeedItems();

  // Filter sources by module or category
  let sources = FEED_SOURCES;
  if (moduleId && isIntelligenceModule(moduleId)) {
    sources = getFeedsForModule(moduleId);
  } else if (category) {
    sources = FEED_SOURCES.filter((s) => s.category === category);
  }

  // Prioritize higher-signal sources first to return quickly.
  sources = [...sources].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  // Fetch only what we need for a quick first paint, then let background warming
  // populate the full cache (which will overwrite this key).
  const target = Math.min(Math.max((offset + limit) * 4, 80), 320);
  const allItems = await fetchFeedsUntil(sources, target);

  // Deduplicate and sort
  let processed = deduplicateByUrl(allItems);
  processed = deduplicateByTitle(processed);
  processed.sort((a, b) => {
    // Primary: latest first, Secondary: significance for same publish time
    const dateDiff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.significance - a.significance;
  });

  setCache(cacheKey, processed, BOOTSTRAP_CACHE_TTL);

  const paginated = processed.slice(offset, offset + limit);

  return Response.json({
    items: paginated,
    total: processed.length,
    lastUpdated: new Date().toISOString(),
    category,
  });
}
