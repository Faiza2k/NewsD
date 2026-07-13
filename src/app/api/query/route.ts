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
  requestedCity?: string;
};

type LinkPreview = {
  url: string;
  title: string;
  description: string;
};

type GoldQuote = { price: number; currency: string; symbol: string };

type CryptoQuote = {
  id: string;
  symbol: string;
  name: string;
  usd: number;
  change24h?: number;
};

type IntentKind = 'weather' | 'gold_price' | 'crypto_price' | 'unsupported_live' | 'news';

type ResolvedIntent =
  | { kind: 'weather'; city: string; cityAsked: boolean }
  | { kind: 'gold_price' }
  | { kind: 'crypto_price'; cryptoId: string }
  | { kind: 'unsupported_live'; topic: 'petrol' }
  | { kind: 'news' };

type QualityPayload = {
  intent: IntentKind;
  whatsappText: string;
  weather?: WeatherPayload | null;
  goldPrice?: GoldQuote | null;
  cryptoPrice?: CryptoQuote | null;
  items?: QueryResultItem[];
  requestedCity?: string;
};

const STOP_WORDS = new Set([
  'tell', 'me', 'about', 'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at',
  'is', 'are', 'was', 'were', 'be', 'news', 'what', 'whats', "what's", 'who', 'when', 'where',
  'why', 'how', 'please', 'give', 'show', 'get', 'latest', 'update', 'updates',
  'today', 'now', 'some', 'any', 'info', 'information', 'regarding', 'related', 'something',
  'everything', 'thing', 'things', 'from', 'with', 'into', 'over', 'under', 'again',
  'can', 'you', 'could', 'would', 'need', 'want', 'looking', 'know', 'explain', 'describe',
  'detail', 'details', 'summary', 'brief', 'quick', 'currently', 'happening',
  'price', 'prices', 'cost', 'rate', 'rates', 'value', 'current', 'spot',
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
  iran: ['iran', 'iranian', 'tehran'],
  america: ['america', 'american', 'usa', 'united states'],
  conflict: ['conflict', 'war', 'fight', 'fighting', 'tensions', 'strike', 'attack'],
};

/** Tokens that must not match longer lookalikes (gold ≠ Goldman). */
const STRICT_ENTITY_BLOCKLIST: Record<string, string[]> = {
  gold: ['goldman', 'golden', 'goldberg', 'goldstein'],
};

const TOKEN_ALIASES: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  ml: 'ai',
  usa: 'america',
  us: 'america',
  war: 'conflict',
  fight: 'conflict',
  fighting: 'conflict',
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

function extractTopicQuery(raw: string): string {
  let q = String(raw || '').trim();
  q = q.replace(/^["'`]+|["'`]+$/g, '');
  q = q.replace(/^(please\s+)?(can you|could you|would you)\s+/i, '');
  q = q.replace(
    /^(tell me|tell us|give me|show me|get me|i want|i need|looking for|explain|describe)\s+(about\s+|regarding\s+|on\s+|for\s+)?/i,
    '',
  );
  q = q.replace(/^(what(?:'s| is| are)|whats)\s+(the\s+)?(latest\s+|current\s+)?/i, '');
  q = q.replace(/^(any|some)\s+(news|updates?|info|information)\s+(on|about|regarding)\s+/i, '');
  q = q.replace(/\?+$/g, '').trim();
  return q || String(raw || '').trim();
}

function aliasToken(t: string): string {
  return TOKEN_ALIASES[t] || t;
}

function tokenize(q: string): string[] {
  return cleanQuery(q)
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .map(aliasToken)
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWord(hay: string, term: string): boolean {
  if (!term) return false;
  const re = new RegExp(`(^|[^a-z0-9_+-])${escapeRegex(term)}([^a-z0-9_+-]|$)`, 'i');
  if (!re.test(hay)) return false;
  const blocked = STRICT_ENTITY_BLOCKLIST[term.toLowerCase()];
  if (blocked?.length) {
    const withoutBlocked = blocked.reduce(
      (acc, b) => acc.replace(new RegExp(escapeRegex(b), 'gi'), ' '),
      hay,
    );
    return re.test(withoutBlocked);
  }
  return true;
}

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

function synonymHit(raw: string, syn: string): boolean {
  if (!syn) return false;
  if (syn.includes(' ')) return raw.includes(syn);
  return raw === syn || hasWord(raw, syn);
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
    if (syns.some((s) => synonymHit(raw, s))) {
      for (const s of syns) expanded.add(s);
      expanded.add(topic);
    }
  }

  return [...expanded];
}

function fallbackPrimary(primary: string[]): string[] {
  if (primary.length <= 2) return primary;
  const known = primary.filter(
    (t) =>
      Boolean(TOPIC_SYNONYMS[t]) ||
      Object.values(TOPIC_SYNONYMS).some((syns) => syns.includes(t)),
  );
  if (known.length > 0) {
    const rest = primary
      .filter((t) => !known.includes(t))
      .sort((a, b) => b.length - a.length);
    return [...known, ...rest].slice(0, 2);
  }
  return [...primary].sort((a, b) => b.length - a.length).slice(0, 2);
}

function topicFromPhrase(q: string): string | null {
  const raw = cleanQuery(q);
  for (const [topic, syns] of Object.entries(TOPIC_SYNONYMS)) {
    if (raw === topic || hasWord(raw, topic)) return topic;
    if (syns.some((s) => (s.includes(' ') ? raw.includes(s) : hasWord(raw, s)))) return topic;
  }
  return null;
}

function extractWeatherLocation(q: string): { city: string; cityAsked: boolean } {
  let s = cleanQuery(q);
  s = s.replace(
    /\b(weather|forecast|temperature|humidity|today|now|current|please|tell|me|about|of|in|for|the|a|an)\b/g,
    ' ',
  );
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return { city: 'London', cityAsked: false };
  return { city: s, cityAsked: true };
}

function isUnsupportedFuelIntent(q: string): boolean {
  const s = cleanQuery(q);
  return /\b(petrol|diesel|gasoline|pump\s*price|fuel\s*price)\b/.test(s);
}

/** Single entrypoint for intent routing. */
function resolveIntent(q: string): ResolvedIntent {
  const s = cleanQuery(q);

  if (isUnsupportedFuelIntent(s)) {
    return { kind: 'unsupported_live', topic: 'petrol' };
  }

  if (
    /^(weather|forecast|temperature|humidity)$/.test(s) ||
    (/\b(weather|forecast|temperature|humidity)\b/.test(s) &&
      !/\b(lng|gas price|oil|stock|market|bitcoin|crypto|gold|ai|nvidia)\b/.test(s))
  ) {
    const loc = extractWeatherLocation(q);
    return { kind: 'weather', city: loc.city, cityAsked: loc.cityAsked };
  }

  if (/\b(gold|xau|bullion)\b/.test(s)) {
    if (
      /\b(price|prices|spot|rate|cost|how much|trading at)\b/.test(s) ||
      /^(gold|xau|bullion)$/.test(s)
    ) {
      return { kind: 'gold_price' };
    }
  }

  const wantsCryptoPrice =
    /\b(price|prices|spot|rate|cost|how much|worth|trading at)\b/.test(s) ||
    /^(bitcoin|btc|ethereum|eth|solana|sol|crypto)$/.test(s);
  if (wantsCryptoPrice) {
    if (/\b(bitcoin|btc)\b/.test(s)) return { kind: 'crypto_price', cryptoId: 'bitcoin' };
    if (/\b(ethereum|eth)\b/.test(s)) return { kind: 'crypto_price', cryptoId: 'ethereum' };
    if (/\b(solana|sol)\b/.test(s)) return { kind: 'crypto_price', cryptoId: 'solana' };
    if (/\b(crypto|cryptocurrency)\b/.test(s)) return { kind: 'crypto_price', cryptoId: 'bitcoin' };
  }

  return { kind: 'news' };
}

async function geocodeLocation(
  name: string,
): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' +
      encodeURIComponent(name);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data?.results) ? data.results[0] : null;
    if (!hit) return null;
    const parts = [hit.name, hit.admin1, hit.country].filter(Boolean);
    return {
      lat: Number(hit.latitude),
      lon: Number(hit.longitude),
      label: parts.join(', '),
    };
  } catch {
    return null;
  }
}

async function fetchDashboardWeather(
  locationHint: string,
  cityAsked: boolean,
): Promise<WeatherPayload | null> {
  try {
    const geo = await geocodeLocation(locationHint);
    if (cityAsked && !geo) {
      return {
        error: `Could not find location “${locationHint}”. Try a clearer city name.`,
        requestedCity: locationHint,
      };
    }
    const lat = geo?.lat ?? 51.5074;
    const lon = geo?.lon ?? -0.1278;
    const label = geo?.label ?? 'London, UK';
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
      location: label,
      requestedCity: cityAsked ? locationHint : undefined,
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

async function fetchLiveGoldPrice(): Promise<GoldQuote | null> {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = Number(data.price ?? data.ask ?? data.bid);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      price,
      currency: String(data.currency || 'USD'),
      symbol: 'XAU',
    };
  } catch {
    return null;
  }
}

async function fetchCryptoPrice(id: string): Promise<CryptoQuote | null> {
  try {
    const url =
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}` +
      '&vs_currencies=usd&include_24hr_change=true';
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const row = data?.[id];
    const usd = Number(row?.usd);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    const names: Record<string, { symbol: string; name: string }> = {
      bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
      ethereum: { symbol: 'ETH', name: 'Ethereum' },
      solana: { symbol: 'SOL', name: 'Solana' },
    };
    const meta = names[id] || { symbol: id.toUpperCase(), name: id };
    return {
      id,
      symbol: meta.symbol,
      name: meta.name,
      usd,
      change24h: Number.isFinite(Number(row?.usd_24h_change))
        ? Number(row.usd_24h_change)
        : undefined,
    };
  } catch {
    return null;
  }
}

function inferCategories(q: string): Category[] {
  const s = cleanQuery(q);
  const out = new Set<Category>();
  if (/\b(ai|llm|gpt|claude|gemini|model|agent|ml|machine learning)\b/.test(s)) out.add('ai');
  if (/\b(crypto|bitcoin|btc|ethereum|eth|solana|defi|token)\b/.test(s)) out.add('crypto');
  if (/\b(trading|stocks?|markets?|forex|fx|gold|oil|commodit|futures|options|earnings)\b/.test(s)) {
    out.add('trading');
  }
  if (/\b(github|open source|repo|repository|library|framework)\b/.test(s)) out.add('github');
  if (/\b(research|paper|arxiv|preprint|study)\b/.test(s)) out.add('research');
  if (/\b(startup|funding|vc|venture|ipo)\b/.test(s)) out.add('startups');
  if (/\b(geopolitic|global|world|policy|sanction)\b/.test(s)) out.add('global');
  if (/\b(tech|technology|chip|hardware|cloud|apple|google|microsoft|nvidia)\b/.test(s)) out.add('tech');
  return [...out];
}

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
  const lastStop = Math.max(
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('! '),
    sliced.lastIndexOf('? '),
  );
  if (lastStop > 160) return sliced.slice(0, lastStop + 1);
  return sliced.trimEnd() + '…';
}

function buildBrief(
  items: QueryResultItem[],
  q: string,
  weather?: WeatherPayload | null,
  poolSize = 0,
): string {
  if (weather?.error) return weather.error;
  if (weather && !weather.error && weather.location) {
    return items.length
      ? `Live conditions for ${weather.location}, plus ${items.length} related stor${items.length === 1 ? 'y' : 'ies'}.`
      : `Live conditions for ${weather.location} from NewsDash.`;
  }
  if (items.length === 0) {
    if (poolSize === 0) {
      return `NewsDash feeds are still syncing. Open the dashboard once, wait a few seconds, then ask “${q}” again.`;
    }
    return `No strong headline match for “${q}” right now (${poolSize} stories checked). Try a clearer topic like bitcoin, gold, AI, oil — or ask “bitcoin price” / “weather in Karachi” for live data.`;
  }
  return `${items.length} matching stor${items.length === 1 ? 'y' : 'ies'} from NewsDash (source links included).`;
}

function buildWeatherBlock(weather: WeatherPayload): string {
  if (weather.error) return `*Live weather*\n${weather.error}`;
  return [
    '*Live weather*',
    `*${weather.location || 'Unknown'}* — ${weather.condition || '—'}`,
    `${weather.temperature ?? '—'}°C (feels ${weather.feelsLike ?? '—'}°C) · Humidity ${weather.humidity ?? '—'}% · Wind ${weather.windKmh ?? '—'} km/h`,
  ].join('\n');
}

function isValidArticleUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Always show outlet name + exact article URL so the user can verify the story. */
function sourceHyperlink(source: string, url: string): string {
  const outlet = source?.trim() || 'Publisher';
  return [
    `*Source:* ${outlet}`,
    '*Open original article:*',
    url.trim(),
  ].join('\n');
}

function formatNewsStoryBlock(i: QueryResultItem, idx: number): string {
  const when = formatTime(i.publishedAt);
  const lines = [
    `*${idx + 1}. ${i.title.trim()}*`,
    when ? `_Published ${when}_` : '',
    waSummary(i.description || ''),
  ];
  if (isValidArticleUrl(i.url)) {
    lines.push(sourceHyperlink(i.source, i.url));
  }
  return lines.filter(Boolean).join('\n');
}

function buildWhatsAppText(
  q: string,
  brief: string,
  items: QueryResultItem[],
  weather?: WeatherPayload | null,
): string {
  const withUrls = items.filter((i) => isValidArticleUrl(i.url));
  const parts = ['*NewsDash Analyst*', '', `*Topic:* ${q}`, brief];

  if (weather && (weather.location || weather.error)) {
    parts.push('', buildWeatherBlock(weather));
  }

  if (!withUrls.length) return parts.join('\n');

  parts.push('', withUrls.map((i, idx) => formatNewsStoryBlock(i, idx)).join('\n\n'));
  parts.push('', '_Tap each link to open the original publisher page and confirm the story._');
  return parts.join('\n');
}

function buildGoldWhatsApp(q: string, gold: GoldQuote): string {
  const brief = 'Live gold spot price from NewsDash market data.';
  const block = [
    '*Live gold price*',
    `*XAU/USD* — $${gold.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} per oz`,
    `_Updated just now_`,
  ].join('\n');
  return ['*NewsDash Analyst*', '', `*Topic:* ${q}`, brief, '', block].join('\n');
}

function buildCryptoWhatsApp(q: string, quote: CryptoQuote): string {
  const ch =
    quote.change24h == null
      ? ''
      : ` · 24h ${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%`;
  const brief = `Live ${quote.name} price from NewsDash market data.`;
  const block = [
    `*Live ${quote.name} price*`,
    `*${quote.symbol}/USD* — $${quote.usd.toLocaleString('en-US', {
      maximumFractionDigits: quote.usd >= 100 ? 2 : 4,
    })}${ch}`,
    `_Updated just now_`,
  ].join('\n');
  return ['*NewsDash Analyst*', '', `*Topic:* ${q}`, brief, '', block].join('\n');
}

function buildUnsupportedFuelWhatsApp(q: string, oilItems: QueryResultItem[]): string {
  const brief =
    'Live Pakistan petrol/diesel pump prices are not wired yet. I will not invent a number.';
  const parts = ['*NewsDash Analyst*', '', `*Topic:* ${q}`, brief];
  const linkedOil = oilItems.filter((i) => isValidArticleUrl(i.url));
  if (linkedOil.length) {
    parts.push('', '_Related oil coverage from NewsDash:_');
    parts.push('', linkedOil.map((i, idx) => formatNewsStoryBlock(i, idx)).join('\n\n'));
    parts.push('', '_Tap the link to open the original publisher article._');
  } else {
    parts.push(
      '',
      'Ask “oil news” for crude/market headlines, or “gold price” / “bitcoin price” for live quotes.',
    );
  }
  return parts.join('\n');
}

function fallbackWhatsApp(q: string, reason: string): string {
  return ['*NewsDash Analyst*', '', `*Topic:* ${q}`, reason].join('\n');
}

/** Quality gate: never send wrong-city weather or empty “successful” prices. */
function assertReplyQuality(payload: QualityPayload): { ok: true } | { ok: false; reason: string } {
  const { intent, whatsappText, weather, goldPrice, cryptoPrice, items, requestedCity } = payload;

  if (!whatsappText || whatsappText.length < 20) {
    return { ok: false, reason: 'Reply was empty. Please ask again.' };
  }

  if (intent === 'weather') {
    if (weather?.error) return { ok: true };
    if (!weather?.location || weather.temperature == null) {
      return { ok: false, reason: 'Could not fetch live weather right now. Please try again.' };
    }
    if (requestedCity) {
      const cityToken = requestedCity.toLowerCase().split(/\s+/)[0];
      if (cityToken && cityToken.length >= 3) {
        const loc = (weather.location || '').toLowerCase();
        if (!loc.includes(cityToken)) {
          return {
            ok: false,
            reason: `Could not confirm weather for “${requestedCity}”. Try a clearer city name.`,
          };
        }
      }
    }
  }

  if (intent === 'gold_price') {
    if (!goldPrice || !(goldPrice.price > 0)) {
      return { ok: false, reason: 'Live gold price is temporarily unavailable. Please try again.' };
    }
    if (!/\$|usd|xau/i.test(whatsappText)) {
      return { ok: false, reason: 'Live gold price is temporarily unavailable. Please try again.' };
    }
  }

  if (intent === 'crypto_price') {
    if (!cryptoPrice || !(cryptoPrice.usd > 0)) {
      return { ok: false, reason: 'Live crypto price is temporarily unavailable. Please try again.' };
    }
  }

  if (intent === 'news' && items && items.length > 0) {
    const weak = items.every((i) => i.matchScore < 10);
    if (weak) {
      return {
        ok: false,
        reason:
          'No strong headline match right now. Try a clearer topic like bitcoin, gold, AI, or oil.',
      };
    }
    const missingUrl = items.some((i) => !isValidArticleUrl(i.url));
    if (missingUrl) {
      return {
        ok: false,
        reason:
          'Could not attach a verifiable source link. Please ask again or try another topic.',
      };
    }
    for (const item of items) {
      if (!whatsappText.includes(item.url.trim())) {
        return {
          ok: false,
          reason:
            'Could not attach a verifiable source link. Please ask again or try another topic.',
        };
      }
    }
  }

  return { ok: true };
}

async function loadFreshItems(): Promise<NewsItem[]> {
  const all = await getFeedItemsForQuery().catch(() => [] as NewsItem[]);
  return all.filter((item) => item?.id && isFresh(item.publishedAt));
}

async function searchNews(
  q: string,
  limit: number,
  categories?: Category[],
): Promise<{
  items: QueryResultItem[];
  total: number;
  poolSize: number;
  primary: string[];
  expanded: string[];
  allowed: Category[];
}> {
  let primary = tokenize(q);
  let expanded = expandTerms(q);
  const phrase = cleanQuery(q);
  const inferred = inferCategories(q);
  const allowed = categories && categories.length > 0 ? categories : inferred;

  const fresh = await loadFreshItems();
  const poolSize = fresh.length;

  const rank = (list: QueryResultItem[]) =>
    list.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

  const scorePool = (terms: string[], exp: string[]) =>
    rank(
      fresh
        .filter((i) => isValidArticleUrl(i.url))
        .map((i) => {
          const { matchScore, score } = scoreItem(i, terms, exp, phrase);
          return { ...i, score, matchScore };
        })
        .filter((i) => i.matchScore >= 10),
    );

  let scored = primary.length ? scorePool(primary, expanded) : [];
  if (scored.length === 0 && primary.length > 2) {
    primary = fallbackPrimary(primary);
    expanded = expandTerms(primary.join(' '));
    scored = scorePool(primary, expanded);
  }
  if (scored.length === 0) {
    const topic = topicFromPhrase(q);
    if (topic) {
      primary = [topic];
      expanded = expandTerms(topic);
      scored = scorePool(primary, expanded);
    }
  }

  return {
    items: scored.slice(0, limit),
    total: scored.length,
    poolSize,
    primary,
    expanded,
    allowed,
  };
}

function linkPreviewFromItems(items: QueryResultItem[]): LinkPreview | undefined {
  const top = items[0];
  if (!top?.url) return undefined;
  return {
    url: top.url,
    title: top.title.slice(0, 100),
    description: waSummary(top.description || '').slice(0, 140),
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as QueryRequest | null;
  if (!body || typeof body.q !== 'string' || body.q.trim().length < 2) {
    return Response.json({ error: 'Provide a query string `q`.' }, { status: 400 });
  }

  const rawQ = body.q.trim();
  const q = extractTopicQuery(rawQ);
  const limit = Math.min(Math.max(body.limit ?? WA_STORY_LIMIT, 1), WA_STORY_LIMIT);
  const intent = resolveIntent(q);
  const now = new Date().toISOString();

  if (intent.kind === 'weather') {
    const weather = await fetchDashboardWeather(intent.city, intent.cityAsked);
    const brief = buildBrief([], q, weather, 0);
    let whatsappText = buildWhatsAppText(q, brief, [], weather);
    const gate = assertReplyQuality({
      intent: 'weather',
      whatsappText,
      weather,
      requestedCity: intent.cityAsked ? intent.city : undefined,
    });
    if (!gate.ok) {
      whatsappText = fallbackWhatsApp(q, gate.reason);
    }
    return Response.json({
      query: q,
      rawQuery: rawQ,
      intent: intent.kind,
      categories: [],
      weather: weather ?? undefined,
      brief,
      items: [],
      total: weather && !weather.error ? 1 : 0,
      whatsappText,
      lastUpdated: now,
    });
  }

  if (intent.kind === 'gold_price') {
    const gold = await fetchLiveGoldPrice();
    if (gold) {
      let whatsappText = buildGoldWhatsApp(q, gold);
      const gate = assertReplyQuality({
        intent: 'gold_price',
        whatsappText,
        goldPrice: gold,
      });
      if (!gate.ok) whatsappText = fallbackWhatsApp(q, gate.reason);
      return Response.json({
        query: q,
        rawQuery: rawQ,
        intent: intent.kind,
        categories: ['trading'],
        brief: 'Live gold spot price from NewsDash market data.',
        items: [],
        total: 1,
        whatsappText,
        goldPrice: gold,
        lastUpdated: now,
      });
    }
  }

  if (intent.kind === 'crypto_price') {
    const quote = await fetchCryptoPrice(intent.cryptoId);
    if (quote) {
      let whatsappText = buildCryptoWhatsApp(q, quote);
      const gate = assertReplyQuality({
        intent: 'crypto_price',
        whatsappText,
        cryptoPrice: quote,
      });
      if (!gate.ok) whatsappText = fallbackWhatsApp(q, gate.reason);
      return Response.json({
        query: q,
        rawQuery: rawQ,
        intent: intent.kind,
        categories: ['crypto'],
        brief: `Live ${quote.name} price from NewsDash market data.`,
        items: [],
        total: 1,
        whatsappText,
        cryptoPrice: quote,
        lastUpdated: now,
      });
    }
  }

  if (intent.kind === 'unsupported_live') {
    const oil = await searchNews('oil crude', 1, ['trading']);
    const oilItems = oil.items.filter((i) =>
      /\b(oil|crude|brent|wti|petroleum)\b/i.test(i.title),
    );
    const whatsappText = buildUnsupportedFuelWhatsApp(q, oilItems.slice(0, 1));
    return Response.json({
      query: q,
      rawQuery: rawQ,
      intent: intent.kind,
      categories: ['trading'],
      brief: 'Live Pakistan petrol/diesel pump prices are not wired yet.',
      items: oilItems.slice(0, 1),
      total: oilItems.length ? 1 : 0,
      poolSize: oil.poolSize,
      whatsappText,
      lastUpdated: now,
    });
  }

  // News from NewsDash dashboard feeds (also gold/crypto fallback if live quote failed)
  const newsQ =
    intent.kind === 'gold_price'
      ? 'gold'
      : intent.kind === 'crypto_price'
        ? intent.cryptoId
        : q;

  if (tokenize(newsQ).length === 0 && !topicFromPhrase(newsQ)) {
    const msg = 'Please ask with a clear keyword (any topic on your NewsDash feeds).';
    return Response.json({
      query: q,
      rawQuery: rawQ,
      intent: 'news',
      categories: [],
      brief: msg,
      items: [],
      total: 0,
      whatsappText: buildWhatsAppText(q, msg, []),
      lastUpdated: now,
    });
  }

  const searched = await searchNews(
    newsQ,
    limit,
    body.categories && body.categories.length > 0 ? body.categories : undefined,
  );

  const brief = buildBrief(searched.items, q, null, searched.poolSize);
  let whatsappText = buildWhatsAppText(q, brief, searched.items);
  const gate = assertReplyQuality({
    intent: 'news',
    whatsappText,
    items: searched.items,
  });
  if (!gate.ok && searched.items.length > 0) {
    whatsappText = fallbackWhatsApp(q, gate.reason);
  }

  const preview = linkPreviewFromItems(searched.items);

  return Response.json({
    query: q,
    rawQuery: rawQ,
    intent: 'news',
    categories: searched.allowed,
    terms: { primary: searched.primary, expanded: searched.expanded },
    brief,
    items: searched.items,
    total: searched.total,
    poolSize: searched.poolSize,
    whatsappText,
    linkPreview: preview,
    linkPreviewEnabled: true,
    lastUpdated: now,
  });
}
