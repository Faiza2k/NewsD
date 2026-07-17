import { getCached, setCache } from '@/lib/feeds/cache';
import { FEED_SOURCES } from '@/lib/feeds/registry';
import { scoreSignificance, deduplicateByUrl, deduplicateByTitle } from '@/lib/utils/relevance-scorer';
import { extractValidDate, isFresh } from '@/lib/feeds/date-utils';
import type { NewsItem, Category } from '@/types';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 6000,
  headers: {
    'User-Agent': 'NewsDash/1.0 Intelligence Dashboard',
    Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml',
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

const CACHE_TTL = 5 * 60 * 1000;
const BATCH_SIZE = 8;
const MAX_ITEMS_PER_FEED = 8;
const ALL_FEEDS_CACHE_KEY = 'feeds_v5:all';
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
}

async function fetchSingleFeed(source: (typeof FEED_SOURCES)[number]): Promise<NewsItem[]> {
  try {
    const feed = await withTimeout(parser.parseURL(source.url), FEED_TIMEOUT_MS);
    const items: NewsItem[] = [];

    for (const item of (feed.items || []).slice(0, MAX_ITEMS_PER_FEED)) {
      const rssItem = item as RSSItem;
      // Strip zero-width/invisible chars (BOM, ZWSP, soft hyphen) some feeds
      // embed in titles — they render as mojibake on WhatsApp/Discord.
      const stripInvisible = (s: string) =>
        s.replace(/[\u200B-\u200F\u2060\uFEFF\u00AD]/g, '').replace(/\s+/g, ' ').trim();
      const title = stripInvisible(rssItem.title || '');
      const description = stripInvisible(
        rssItem.contentSnippet ||
          rssItem.content?.replace(/<[^>]*>/g, '') ||
          '',
      );
      const url = rssItem.link || '';

      // Never fabricate freshness: require a real, verifiable publish date.
      const publishedAt = extractValidDate(item as unknown as Record<string, unknown>);
      if (!title || !url || !publishedAt || !isFresh(publishedAt)) continue;

      const significance = scoreSignificance(
        title,
        description,
        source.category,
        publishedAt,
        source.category
      );
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
  } catch {
    return [];
  }
}

async function fetchFeedsBatch(sources: typeof FEED_SOURCES): Promise<NewsItem[]> {
  const allItems: NewsItem[] = [];

  for (let i = 0; i < sources.length; i += BATCH_SIZE) {
    const batch = sources.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchSingleFeed));
    for (const result of results) {
      if (result.status === 'fulfilled') allItems.push(...result.value);
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

function processItems(items: NewsItem[]): NewsItem[] {
  let processed = deduplicateByUrl(items);
  processed = deduplicateByTitle(processed);
  processed.sort((a, b) => {
    const dateDiff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.significance - a.significance;
  });
  return processed;
}

/** Load all feed items (uses shared cache with /api/feeds). */
export async function getAllFeedItems(force = false): Promise<NewsItem[]> {
  if (!force) {
    const cached = getCached<NewsItem[]>(ALL_FEEDS_CACHE_KEY);
    if (cached) return cached;
  }

  // Fast bootstrap first (so Daily Briefing doesn't wait minutes),
  // then refresh a fuller cache in the background.
  const prioritized = [...FEED_SOURCES].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const bootstrapItems = await fetchFeedsUntil(prioritized, 320);
  const processed = processItems(bootstrapItems);
  setCache(ALL_FEEDS_CACHE_KEY, processed, CACHE_TTL);

  void (async () => {
    try {
      const allItems = await fetchFeedsBatch(prioritized);
      const fullProcessed = processItems(allItems);
      setCache(ALL_FEEDS_CACHE_KEY, fullProcessed, CACHE_TTL);

      for (const cat of ['ai', 'crypto', 'trading', 'github', 'tech', 'research', 'startups', 'global'] as Category[]) {
        const catItems = fullProcessed.filter((i) => i.category === cat);
        setCache(`feeds_v5:${cat}`, catItems, CACHE_TTL);
      }
    } catch {
      // ignore background refresh failures
    }
  })();

  return processed;
}

/**
 * Fast path for WhatsApp /api/query.
 * Keep the request path fast: use cache when possible, otherwise a bounded
 * bootstrap that prioritizes global + high-priority feeds. Never block on a
 * full catalog refresh inside the request.
 */
export async function getFeedItemsForQuery(): Promise<NewsItem[]> {
  const MIN_HEALTHY = 120;
  const cached = getCached<NewsItem[]>(ALL_FEEDS_CACHE_KEY);
  if (cached && cached.length >= MIN_HEALTHY) {
    // Keep answering from cache, but refresh the full catalog in the background
    // so price/geopolitics/tech stories stay current across all sources.
    void getAllFeedItems(true).catch(() => undefined);
    return cached;
  }

  const merged = new Map<string, NewsItem>();
  if (cached) for (const item of cached) merged.set(item.id, item);
  for (const cat of ['global', 'ai', 'crypto', 'trading', 'tech', 'research', 'startups', 'github'] as Category[]) {
    const part = getCached<NewsItem[]>(`feeds_v5:${cat}`);
    if (!part) continue;
    for (const item of part) merged.set(item.id, item);
  }
  if (merged.size >= MIN_HEALTHY) {
    const items = processItems([...merged.values()]);
    setCache(ALL_FEEDS_CACHE_KEY, items, CACHE_TTL);
    void getAllFeedItems(true).catch(() => undefined);
    return items;
  }

  const globalFirst = FEED_SOURCES.filter((s) => s.category === 'global')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 22);
  const rest = FEED_SOURCES.filter((s) => s.category !== 'global')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 36);
  const prioritized = [...globalFirst, ...rest];

  let bootstrap: NewsItem[] = [];
  try {
    bootstrap = await Promise.race([
      fetchFeedsUntil(prioritized, 220).then((items) => processItems(items)),
      new Promise<NewsItem[]>((resolve) => setTimeout(() => resolve([]), 14000)),
    ]);
  } catch {
    bootstrap = [];
  }

  if (bootstrap.length > 0) {
    for (const item of bootstrap) merged.set(item.id, item);
    const items = processItems([...merged.values()]);
    setCache(ALL_FEEDS_CACHE_KEY, items, CACHE_TTL);
    for (const cat of ['ai', 'crypto', 'trading', 'github', 'tech', 'research', 'startups', 'global'] as Category[]) {
      const catItems = items.filter((i) => i.category === cat);
      if (catItems.length) setCache(`feeds_v5:${cat}`, catItems, CACHE_TTL);
    }
    void getAllFeedItems(true).catch(() => undefined);
    return items;
  }

  if (merged.size > 0) return processItems([...merged.values()]);

  void getAllFeedItems(false).catch(() => undefined);
  return getCached<NewsItem[]>(ALL_FEEDS_CACHE_KEY) || [];
}
