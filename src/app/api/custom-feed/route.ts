import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
import Parser from 'rss-parser';
import { extractValidDate, isFresh } from '@/lib/feeds/date-utils';
import type { NewsItem, Category } from '@/types';

const parser = new Parser({
  timeout: 9000,
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

const MAX_ITEMS_PER_FEED = 8;
const FEED_TIMEOUT_MS = 9000;

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

interface CustomSourceInput {
  id?: string;
  name?: string;
  url: string;
  category?: Category;
}

interface RSSItem {
  title?: string;
  link?: string;
  contentSnippet?: string;
  content?: string;
  isoDate?: string;
  pubDate?: string;
}

async function fetchCustomSource(source: CustomSourceInput): Promise<NewsItem[]> {
  try {
    const feed = await withTimeout(parser.parseURL(source.url), FEED_TIMEOUT_MS);
    const name = source.name || feed.title || new URL(source.url).hostname;
    const category = (source.category ?? 'tech') as Category;
    const items: NewsItem[] = [];

    for (const raw of (feed.items || []).slice(0, MAX_ITEMS_PER_FEED)) {
      const item = raw as RSSItem;
      const title = item.title?.trim() || '';
      const url = item.link || '';

      // Never fabricate freshness: require a real, verifiable publish date.
      const publishedAt = extractValidDate(item as unknown as Record<string, unknown>);
      if (!title || !url || !publishedAt || !isFresh(publishedAt)) continue;

      const description =
        item.contentSnippet?.trim() ||
        item.content?.replace(/<[^>]*>/g, '').trim() ||
        '';
      const urlHash = Buffer.from(url).toString('base64');

      items.push({
        id: `custom-${urlHash}`,
        title,
        description: description.slice(0, 300),
        url,
        source: name,
        category,
        subcategory: 'custom',
        publishedAt,
        significance: 6,
        tags: ['custom'],
      });
    }

    return items;
  } catch (err) {
    console.error('[custom-feed] fetch failed for', source.url, err);
    return [];
  }
}

/** Validate a single feed URL: GET /api/custom-feed?url=... */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return Response.json({ ok: false, error: 'Missing url' }, { status: 400 });
  }
  const items = await fetchCustomSource({ url });
  return Response.json({ ok: items.length > 0, count: items.length });
}

/** Fetch multiple custom sources: POST { sources: CustomSourceInput[] } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const sources: CustomSourceInput[] = Array.isArray(body?.sources) ? body.sources : [];

  if (sources.length === 0) {
    return Response.json({ items: [] });
  }

  const results = await Promise.allSettled(sources.map(fetchCustomSource));
  const items: NewsItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') items.push(...result.value);
  }

  items.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return Response.json({ items });
}
