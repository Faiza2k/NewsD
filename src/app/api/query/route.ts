import { getFeedItemsForQuery } from '@/lib/feeds/fetch-all-feeds';
import { isFresh } from '@/lib/feeds/date-utils';
import type { Category, NewsItem } from '@/types';

export const dynamic = 'force-dynamic';

type QueryRequest = {
  q: string;
  limit?: number;
  categories?: Category[];
};

type QueryResultItem = NewsItem & {
  score: number;
  matchScore: number;
};

type WeatherPayload = {
  location?: string;
  temperature?: number;
  feelsLike?: number;
  humidity?: number;
  windKmh?: number;
  condition?: string;
  updatedAt?: string;
  error?: string;
};

type LinkPreview = {
  url: string;
  title: string;
  description: string;
};

const STOP_WORDS = new Set([
  'tell', 'me', 'about', 'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at',
  'is', 'are', 'was', 'were', 'be', 'been', 'what', 'whats', "what's", 'who', 'when', 'where',
  'why', 'how', 'please', 'give', 'show', 'get', 'latest', 'news', 'update', 'updates',
  'today', 'now', 'some', 'any', 'info', 'information', 'regarding', 'related', 'something',
  'everything', 'thing', 'things', 'from', 'with', 'into', 'over', 'under', 'again',
]);

/** Optional boosts only — any other word still searches the full dashboard. */
const TOPIC_SYNONYMS: Record<string, string[]> = {
  weather: ['weather', 'forecast', 'temperature', 'rainfall', 'heatwave', 'snowfall', 'monsoon'],
  gold: ['gold', 'bullion', 'xau'],
  oil: ['oil', 'crude', 'brent', 'wti', 'petroleum'],
  bitcoin: ['bitcoin', 'btc'],
  crypto: ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'btc', 'eth', 'defi'],
  ethereum: ['ethereum', 'eth'],
  ai: ['ai', 'artificial intelligence', 'llm', 'gpt', 'machine learning', 'openai', 'claude'],
  nvidia: ['nvidia', 'nvda', 'gpu'],
  forex: ['forex', 'fx'],
  stocks: ['stocks', 'equities', 'shares', 'nasdaq'],
};

const WA_SUMMARY_MAX = 420;
const WA_STORY_LIMIT = 2;

function cleanQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(q: string): string[] {
  return cleanQuery(q)
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWord(hay: string, term: string): boolean {
  if (!term) return false;
  // ASCII-safe word boundary (more reliable than \\p{L} in all runtimes)
  const re = new RegExp(`(^|[^a-z0-9_+-])${escapeRegex(term)}([^a-z0-9_+-]|$)`, 'i');
  return re.test(hay);
}

/** Simple plural / singular variants so “chip” matches “chips”, etc. */
function termVariants(term: string): string[] {
  const t = term.toLowerCase();
  const out = new Set<string>([t]);
  if (t.endsWith('ies') && t.length > 4) out.add(`${t.slice(0, -3)}y`);
  if (t.endsWith('es') && t.length > 4) out.add(t.slice(0, -2));
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) out.add(t.slice(0, -1));
  else if (!t.endsWith('s')) out.add(`${t}s`);
  if (t.endsWith('y') && t.length > 3) out.add(`${t.slice(0, -1)}ies`);
  return [...out];
}

function matchesAnyVariant(hay: string, term: string): boolean {
  return termVariants(term).some((v) => hasWord(hay, v));
}

function expandTerms(q: string): string[] {
  const base = tokenize(q);
  const expanded = new Set<string>(base);
  const raw = cleanQuery(q);

  for (const [topic, syns] of Object.entries(TOPIC_SYNONYMS)) {
    if (raw === topic || base.includes(topic) || hasWord(raw, topic)) {
      for (const s of syns) expanded.add(s);
    }
  }
  for (const [topic, syns] of Object.entries(TOPIC_SYNONYMS)) {
    if (syns.some((s) => raw === s || hasWord(raw, s))) {
      for (const s of syns) expanded.add(s);
      expanded.add(topic);
    }
  }

  return [...expanded];
}

function isWeatherIntent(q: string): boolean {
  const s = cleanQuery(q);
  if (/^(weather|forecast|temperature|humidity)$/.test(s)) return true;
  if (/\b(weather|forecast|temperature|humidity)\b/.test(s)) {
    if (/\b(lng|gas price|oil|stock|market|bitcoin|crypto|gold|ai|nvidia)\b/.test(s)) return false;
    return true;
  }
  return false;
}

function inferCategories(q: string): Category[] {
  const s = cleanQuery(q);
  const out = new Set<Category>();
  if (/\b(ai|llm|gpt|claude|gemini|model|agent|ml|machine learning)\b/.test(s)) out.add('ai');
  if (/\b(crypto|bitcoin|btc|ethereum|eth|solana|defi|token)\b/.test(s)) out.add('crypto');
  if (/\b(trading|stocks?|markets?|forex|fx|gold|oil|commodit|futures|options|earnings)\b/.test(s)) out.add('trading');
  if (/\b(github|open source|repo|repository|library|framework)\b/.test(s)) out.add('github');
  if (/\b(research|paper|arxiv|preprint|study)\b/.test(s)) out.add('research');
  if (/\b(startup|funding|vc|venture|ipo)\b/.test(s)) out.add('startups');
  if (/\b(geopolitic|global|world|policy|sanction)\b/.test(s)) out.add('global');
  if (/\b(tech|technology|chip|hardware|cloud|apple|google|microsoft|nvidia)\b/.test(s)) out.add('tech');
  return [...out];
}

/**
 * Accurate relevance for ANY user topic:
 * - 1 word  → must appear in the TITLE
 * - 2 words → both must appear somewhere; at least one in TITLE
 * - 3+     → majority of terms; at least one in TITLE (or full phrase in title)
 */
function scoreItem(
  item: NewsItem,
  primary: string[],
  expanded: string[],
  phrase: string,
): { matchScore: number; score: number } {
  const hayTitle = item.title.toLowerCase();
  const hayDesc = (item.description || '').toLowerCase();
  const hayTags = (item.tags || []).join(' ').toLowerCase();
  const hayAll = `${hayTitle} ${hayDesc} ${hayTags}`;

  let matchScore = 0;
  let titleHits = 0;
  let anywhereHits = 0;

  if (phrase.length >= 3) {
    if (hayTitle.includes(phrase)) matchScore += 20;
    else if (hayDesc.includes(phrase)) matchScore += 8;
  }

  for (const t of primary) {
    if (!t) continue;
    if (matchesAnyVariant(hayTitle, t)) {
      matchScore += 14;
      titleHits += 1;
      anywhereHits += 1;
    } else if (matchesAnyVariant(hayDesc, t) || matchesAnyVariant(hayTags, t)) {
      matchScore += 5;
      anywhereHits += 1;
    }
  }

  for (const t of expanded) {
    if (!t || primary.includes(t)) continue;
    if (matchesAnyVariant(hayTitle, t)) matchScore += 3;
    else if (matchesAnyVariant(hayAll, t)) matchScore += 1;
  }

  const n = primary.length;
  if (n === 0) return { matchScore: 0, score: 0 };

  if (n === 1) {
    if (titleHits < 1) return { matchScore: 0, score: 0 };
  } else if (n === 2) {
    if (anywhereHits < 2 || titleHits < 1) return { matchScore: 0, score: 0 };
  } else {
    const need = Math.ceil(n * 0.6);
    const phraseInTitle = phrase.length >= 4 && hayTitle.includes(phrase);
    if (anywhereHits < need) return { matchScore: 0, score: 0 };
    if (titleHits < 1 && !phraseInTitle) return { matchScore: 0, score: 0 };
  }

  if (matchScore < 10) return { matchScore: 0, score: 0 };

  let score = matchScore;
  const ageMs = Date.now() - new Date(item.publishedAt).getTime();
  if (ageMs < 6 * 60 * 60 * 1000) score += 2;
  else if (ageMs < 24 * 60 * 60 * 1000) score += 1;
  score += Math.min(2, Math.max(0, item.significance / 5));

  return { matchScore, score };
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function waSummary(desc: string): string {
  const clean = desc.replace(/\s+/g, ' ').trim();
  if (!clean) return 'No summary was available from the NewsDash feed for this story.';
  if (clean.length <= WA_SUMMARY_MAX) return clean;
  const sliced = clean.slice(0, WA_SUMMARY_MAX);
  const lastStop = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '));
  if (lastStop > 160) return sliced.slice(0, lastStop + 1);
  return sliced.trimEnd() + '…';
}

function buildBrief(
  items: QueryResultItem[],
  q: string,
  weather?: WeatherPayload | null,
  poolSize = 0,
): string {
  if (weather && !weather.error && weather.location) {
    return items.length
      ? `Live conditions for ${weather.location}, plus ${items.length} related stor${items.length === 1 ? 'y' : 'ies'}.`
      : `Live conditions for ${weather.location} from NewsDash.`;
  }
  if (items.length === 0) {
    if (poolSize === 0) {
      return `NewsDash feeds are still syncing. Open the dashboard once, wait a few seconds, then ask “${q}” again.`;
    }
    return `No on-topic headline for “${q}” in the current NewsDash feeds (${poolSize} stories checked). Try a word that appears in a headline.`;
  }
  return `${items.length} matching stor${items.length === 1 ? 'y' : 'ies'} from NewsDash.`;
}

function buildWeatherBlock(weather: WeatherPayload): string {
  return [
    '*Live weather*',
    `*${weather.location || 'Unknown'}* — ${weather.condition || '—'}`,
    `${weather.temperature ?? '—'}°C (feels ${weather.feelsLike ?? '—'}°C) · Humidity ${weather.humidity ?? '—'}% · Wind ${weather.windKmh ?? '—'} km/h`,
  ].join('\n');
}

/** URL alone on its own line → WhatsApp blue tappable hyperlink. */
function sourceHyperlink(source: string, url: string): string {
  const label = source ? `*Source: ${source}*` : '*Source*';
  return `${label}\n${url}`;
}

function buildWhatsAppText(
  q: string,
  brief: string,
  items: QueryResultItem[],
  weather?: WeatherPayload | null,
): string {
  const parts = ['*NewsDash Analyst*', '', `*Topic:* ${q}`, brief];

  if (weather && !weather.error && weather.location) {
    parts.push('', buildWeatherBlock(weather));
  }

  if (!items.length) return parts.join('\n');

  const blocks = items.map((i, idx) => {
    const when = formatTime(i.publishedAt);
    return [
      `*${idx + 1}. ${i.title.trim()}*`,
      when ? `_Published ${when}_` : '',
      waSummary(i.description || ''),
      i.url ? sourceHyperlink(i.source, i.url) : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  parts.push('', blocks.join('\n\n'));
  return parts.join('\n');
}

/** Search the same feed pool the dashboard uses. */
async function loadFreshItems(): Promise<NewsItem[]> {
  const all = await getFeedItemsForQuery().catch(() => [] as NewsItem[]);
  return all.filter((item) => item?.id && isFresh(item.publishedAt));
}

async function fetchDashboardWeather(): Promise<WeatherPayload | null> {
  try {
    const lat = 51.5074;
    const lon = -0.1278;
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
      '&timezone=auto';
    const wxRes = await fetch(forecastUrl, { headers: { Accept: 'application/json' } });
    if (!wxRes.ok) return null;
    const payload = await wxRes.json();
    const current = payload.current ?? {};
    const code = Number(current.weather_code ?? 3);
    const labels: Record<number, string> = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Foggy',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      80: 'Rain showers',
      95: 'Thunderstorm',
    };
    return {
      location: 'London, UK',
      temperature: Math.round(Number(current.temperature_2m ?? 0)),
      feelsLike: Math.round(Number(current.apparent_temperature ?? 0)),
      humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
      windKmh: Math.round(Number(current.wind_speed_10m ?? 0)),
      condition: labels[code] ?? 'Variable',
      updatedAt: current.time ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as QueryRequest | null;
  if (!body || typeof body.q !== 'string' || body.q.trim().length < 2) {
    return Response.json({ error: 'Provide a query string `q`.' }, { status: 400 });
  }

  const q = body.q.trim();
  const limit = Math.min(Math.max(body.limit ?? WA_STORY_LIMIT, 1), WA_STORY_LIMIT);
  const primary = tokenize(q);
  const expanded = expandTerms(q);
  const phrase = cleanQuery(q);
  const weatherIntent = isWeatherIntent(q);

  if (primary.length === 0) {
    const msg = 'Please ask with a clear keyword (any topic on your NewsDash feeds).';
    return Response.json({
      query: q,
      categories: [],
      brief: msg,
      items: [],
      total: 0,
      whatsappText: buildWhatsAppText(q, msg, []),
      lastUpdated: new Date().toISOString(),
    });
  }

  const weatherPromise = weatherIntent ? fetchDashboardWeather() : Promise.resolve(null);
  const pureWeather = weatherIntent && /^(weather|forecast|temperature|humidity)$/.test(phrase);

  let items: QueryResultItem[] = [];
  let scoredTotal = 0;
  let allowed: Category[] = body.categories && body.categories.length > 0 ? body.categories : [];

  if (!pureWeather) {
    const inferred = inferCategories(q);
    allowed = body.categories && body.categories.length > 0 ? body.categories : inferred;

    const fresh = await loadFreshItems();
    const poolSize = fresh.length;

    const scored: QueryResultItem[] = fresh
      .map((i) => {
        const { matchScore, score } = scoreItem(i, primary, expanded, phrase);
        return { ...i, score, matchScore };
      })
      .filter((i) => i.matchScore >= 10)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });

    scoredTotal = scored.length;
    items = scored.slice(0, limit);

    const weather = await weatherPromise;
    const brief = buildBrief(items, q, weather, poolSize);
    const whatsappText = buildWhatsAppText(q, brief, items, weather);

    const top = items[0];
    const preview: LinkPreview | undefined =
      top?.url
        ? {
            url: top.url,
            title: top.title.slice(0, 100),
            description: waSummary(top.description || '').slice(0, 140),
          }
        : undefined;

    return Response.json({
      query: q,
      categories: allowed,
      terms: { primary, expanded },
      weather: weather ?? undefined,
      brief,
      items,
      total: scoredTotal,
      poolSize,
      whatsappText,
      linkPreview: preview,
      linkPreviewEnabled: true,
      lastUpdated: new Date().toISOString(),
    });
  }

  const weather = await weatherPromise;
  const brief = buildBrief(items, q, weather, 0);
  const whatsappText = buildWhatsAppText(q, brief, items, weather);

  const top = items[0];
  const preview: LinkPreview | undefined =
    top?.url
      ? {
          url: top.url,
          title: top.title.slice(0, 100),
          description: waSummary(top.description || '').slice(0, 140),
        }
      : undefined;

  return Response.json({
    query: q,
    categories: allowed,
    terms: { primary, expanded },
    weather: weather ?? undefined,
    brief,
    items,
    total: scoredTotal,
    whatsappText,
    linkPreview: preview,
    linkPreviewEnabled: true,
    lastUpdated: new Date().toISOString(),
  });
}
