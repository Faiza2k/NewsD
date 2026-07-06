import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
import { getCached, setCache } from '@/lib/feeds/cache';
import { FEED_SOURCES } from '@/lib/feeds/registry';
import { getFeedsForModule, isIntelligenceModule } from '@/lib/feeds/module-feeds';
import { scoreSignificance, deduplicateByUrl, deduplicateByTitle } from '@/lib/utils/relevance-scorer';
import type { NewsItem, Category } from '@/types';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'NewsDash/1.0 Intelligence Dashboard',
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
  },
  maxRedirects: 3,
});

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 5;
const MAX_ITEMS_PER_FEED = 8;

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
    const feed = await parser.parseURL(source.url);
    const items: NewsItem[] = [];

    for (const item of (feed.items || []).slice(0, MAX_ITEMS_PER_FEED)) {
      const rssItem = item as RSSItem;
      const title = rssItem.title?.trim() || '';
      const description = rssItem.contentSnippet?.trim() || rssItem.content?.replace(/<[^>]*>/g, '').trim() || '';
      const url = rssItem.link || '';
      const publishedAt = rssItem.isoDate || rssItem.pubDate || new Date().toISOString();

      if (!title || !url) continue;

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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') as Category | null;
  const moduleId = searchParams.get('module');
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  const cacheKey = `feeds_v5:${moduleId || category || 'all'}`;
  const cached = getCached<NewsItem[]>(cacheKey);

  if (cached) {
    const paginated = cached.slice(offset, offset + limit);
    return Response.json({
      items: paginated,
      total: cached.length,
      lastUpdated: new Date().toISOString(),
      category,
    });
  }

  // Filter sources by module or category
  let sources = FEED_SOURCES;
  if (moduleId && isIntelligenceModule(moduleId)) {
    sources = getFeedsForModule(moduleId);
  } else if (category) {
    sources = FEED_SOURCES.filter((s) => s.category === category);
  }

  const allItems = await fetchFeedsBatch(sources);

  // Deduplicate and sort
  let processed = deduplicateByUrl(allItems);
  processed = deduplicateByTitle(processed);
  processed.sort((a, b) => {
    // Primary: latest first, Secondary: significance for same publish time
    const dateDiff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.significance - a.significance;
  });

  setCache(cacheKey, processed, CACHE_TTL);

  const paginated = processed.slice(offset, offset + limit);

  return Response.json({
    items: paginated,
    total: processed.length,
    lastUpdated: new Date().toISOString(),
    category,
  });
}
