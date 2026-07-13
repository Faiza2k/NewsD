/**
 * WhatsApp-only article body enrichment.
 * Prefer long RSS text when present; otherwise fetch the publisher page.
 */

const USER_AGENT = 'NewsDash/1.0 Ask Agent (+https://news-d.vercel.app)';
const FETCH_TIMEOUT_MS = 6000;
const BODY_CAP = 7500;
const THIN_BODY_CHARS = 280;

const CHROME_HINTS =
  /\b(toggle mega menu|subscribe to|sign in|cookie|privacy policy|terms of (use|service)|all rights reserved|download the app|advertisement|related articles|share this|follow us|newsletter)\b/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?(p|div|br|li|h[1-6]|tr|section|article)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

function capBody(text: string): string {
  if (text.length <= BODY_CAP) return text;
  const sliced = text.slice(0, BODY_CAP);
  const stop = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('\n'));
  return (stop > BODY_CAP * 0.5 ? sliced.slice(0, stop + 1) : sliced).trim();
}

function extractMetaContent(html: string, property: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["'][^>]*>`,
    'i',
  );
  const m = html.match(re) || html.match(re2);
  return m?.[1]?.trim() || '';
}

function extractTaggedRegion(html: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = html.match(re);
  return m?.[1] || '';
}

function scorePlainText(text: string): number {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 80) return 0;
  let score = Math.min(t.length, 4000);
  const sentences = (t.match(/[.!?]["']?\s+[A-Z]/g) || []).length;
  score += sentences * 40;
  if (CHROME_HINTS.test(t)) score -= 800;
  // Heavy ticker / nav noise
  const dollarTicks = (t.match(/\$\d/g) || []).length;
  if (dollarTicks > 8) score -= 1000;
  const shortLines = t.split('\n').filter((l) => l.trim().length > 0 && l.trim().length < 28).length;
  if (shortLines > 25) score -= 600;
  return score;
}

function extractMainText(html: string): string {
  const candidates: string[] = [];

  const article = extractTaggedRegion(html, 'article');
  if (article) candidates.push(stripHtml(article));

  const main = extractTaggedRegion(html, 'main');
  if (main) candidates.push(stripHtml(main));

  const roleMain = html.match(/<[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i);
  if (roleMain?.[1]) candidates.push(stripHtml(roleMain[1]));

  // Strip chrome regions then whole page as last resort
  const cleaned = html
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  candidates.push(stripHtml(cleaned));

  const og = [extractMetaContent(html, 'og:description'), extractMetaContent(html, 'description')]
    .filter(Boolean)
    .join('\n\n');
  if (og) candidates.push(og);

  let best = '';
  let bestScore = -1;
  for (const c of candidates) {
    const plain = capBody(c);
    const s = scorePlainText(plain);
    if (s > bestScore) {
      bestScore = s;
      best = plain;
    }
  }
  // Reject obvious chrome dumps
  if (bestScore < 120) return og ? capBody(og) : '';
  return best;
}

export function isThinBody(text: string | undefined | null): boolean {
  return !text || text.replace(/\s+/g, ' ').trim().length < THIN_BODY_CHARS;
}

export function isNoisyBody(text: string): boolean {
  if (!text) return true;
  return scorePlainText(text) < 150 || CHROME_HINTS.test(text.slice(0, 1200));
}

/** Fetch and clean article HTML body. Soft-fails to empty string. */
export async function fetchArticleBody(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (ctype && !ctype.includes('html') && !ctype.includes('xml') && !ctype.includes('text')) {
      return '';
    }
    const html = await res.text();
    return extractMainText(html);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export type ArticleSourceInput = {
  url: string;
  description?: string;
  /** Optional longer RSS content already on hand */
  rssBody?: string;
  title?: string;
};

/**
 * Resolve the best available body for a story:
 * long RSS text first, then HTTP fetch, then short description.
 */
export async function resolveArticleBody(item: ArticleSourceInput): Promise<string> {
  const rss = capBody(stripHtml(String(item.rssBody || item.description || '').trim()));
  if (!isThinBody(rss) && !isNoisyBody(rss)) return rss;

  const fetched = await fetchArticleBody(item.url);
  if (!isThinBody(fetched) && !isNoisyBody(fetched)) return fetched;

  // Prefer clean short RSS/description over noisy full-page scrape
  if (rss && !isNoisyBody(rss)) return rss;
  if (item.description?.trim()) return item.description.trim();
  if (item.title?.trim()) return item.title.trim();
  return fetched || rss || '';
}

export async function resolveArticleBodies(
  items: ArticleSourceInput[],
): Promise<string[]> {
  return Promise.all(
    items.map((item) =>
      resolveArticleBody({
        ...item,
        title: item.title,
      }),
    ),
  );
}
