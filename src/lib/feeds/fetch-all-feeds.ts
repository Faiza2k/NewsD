import { getCached, setCache } from '@/lib/feeds/cache';
import { FEED_SOURCES } from '@/lib/feeds/registry';
import { scoreSignificance, deduplicateByUrl, deduplicateByTitle } from '@/lib/utils/relevance-scorer';
import type { NewsItem, Category } from '@/types';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'NewsDash/1.0 Intelligence Dashboard',
    Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml',
  },
  maxRedirects: 3,
});

const CACHE_TTL = 5 * 60 * 1000;
const BATCH_SIZE = 5;
const MAX_ITEMS_PER_FEED = 8;
const ALL_FEEDS_CACHE_KEY = 'feeds_v5:all';

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
    const feed = await parser.parseURL(source.url);
    const items: NewsItem[] = [];

    for (const item of (feed.items || []).slice(0, MAX_ITEMS_PER_FEED)) {
      const rssItem = item as RSSItem;
      const title = rssItem.title?.trim() || '';
      const description =
        rssItem.contentSnippet?.trim() ||
        rssItem.content?.replace(/<[^>]*>/g, '').trim() ||
        '';
      const url = rssItem.link || '';
      const publishedAt = rssItem.isoDate || rssItem.pubDate || new Date().toISOString();

      if (!title || !url) continue;

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

  const allItems = await fetchFeedsBatch(FEED_SOURCES);
  const processed = processItems(allItems);
  setCache(ALL_FEEDS_CACHE_KEY, processed, CACHE_TTL);

  for (const cat of ['ai', 'crypto', 'trading', 'github', 'tech', 'research', 'startups', 'global'] as Category[]) {
    const catItems = processed.filter((i) => i.category === cat);
    setCache(`feeds_v5:${cat}`, catItems, CACHE_TTL);
  }

  return processed;
}
