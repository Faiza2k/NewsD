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
  matchedTerms?: string[];
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

type GoldQuote = {
  price: number;
  currency: string;
  symbol: string;
  pkrPerTolaApprox?: number;
  usdPkrRate?: number;
};

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
  oil: ['oil', 'crude', 'brent', 'wti', 'petroleum', 'petrol', 'diesel', 'fuel', 'gasoline', 'opec'],
  petrol: ['petrol', 'diesel', 'gasoline', 'fuel', 'oil', 'crude', 'petroleum'],
  fuel: ['fuel', 'petrol', 'diesel', 'gasoline', 'oil', 'crude', 'petroleum'],
  pakistan: ['pakistan', 'pakistani', 'karachi', 'islamabad', 'lahore', 'pkr'],
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
  energy: ['energy', 'oil', 'gas', 'fuel', 'power', 'electricity'],
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
  gasoline: 'petrol',
  diesel: 'petrol',
};

const WA_SUMMARY_MAX = 220;
const WA_STORY_LIMIT = 2;
const WA_STORY_LIMIT_MAX = 2;
const GRAMS_PER_TROY_OZ = 31.1034768;
const GRAMS_PER_TOLA = 11.6638038;

const TEASER_TITLE_RE =
  /\b(latest (ai |tech )?news|updates? we announced|the download|round-?up|weekly roundup|daily digest|here('?s| are)|top \d+|things to know|what we announced|newsletter)\b/i;
const NEWSLETTER_BOILERPLATE_RE =
  /this is today'?s edition|weekday newsletter|daily dose of what'?s going on|subscribe to|read more on our (site|blog)|sign up for/i;
const CONCRETE_EVENT_RE =
  /\b(announce[sd]?|launch(es|ed)?|rais(es|ed)|cut[s]?|sue[sd]?|ban[s]?|approv(es|ed)|beat[s]?|miss(es|ed)?|surge[sd]?|crash(es|ed)?|acquire[sd]?|ipo|partners?|wins?|loses?|warns?|halts?|resumes?|strikes?|attacks?|signs?|passes?|rejects?)\b/i;

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

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) => (w.length <= 3 && /^(ai|btc|eth|usd|pkr|fx)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Short label for WhatsApp *Topic:* line (not the raw user sentence). */
function displayTopic(q: string, intent: ResolvedIntent): string {
  if (intent.kind === 'weather') {
    return intent.cityAsked ? `${titleCaseWords(intent.city)} weather` : 'Weather';
  }
  if (intent.kind === 'gold_price') return 'Gold price';
  if (intent.kind === 'crypto_price') {
    const names: Record<string, string> = {
      bitcoin: 'Bitcoin price',
      ethereum: 'Ethereum price',
      solana: 'Solana price',
    };
    return names[intent.cryptoId] || 'Crypto price';
  }
  if (intent.kind === 'unsupported_live') return 'Petrol price';

  const topic = topicFromPhrase(q);
  if (topic) return titleCaseWords(topic);
  const tokens = tokenize(q);
  if (tokens.length) return titleCaseWords(tokens.slice(0, 4).join(' '));
  return titleCaseWords(cleanQuery(q).slice(0, 40)) || 'News';
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
  return /\b(petrol|diesel|gasoline|gas\s*price|pump\s*price|fuel\s*price)\b/.test(s);
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
        error: `Could not find location "${locationHint}". Try a clearer city name.`,
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

async function fetchUsdPkrRate(): Promise<number | null> {
  const endpoints = [
    'https://open.er-api.com/v6/latest/USD',
    'https://api.exchangerate-api.com/v4/latest/USD',
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const rate = Number(data?.rates?.PKR);
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

function approxPkrPerTola(usdPerOz: number, usdPkr: number): number {
  const usdPerGram = usdPerOz / GRAMS_PER_TROY_OZ;
  const usdPerTola = usdPerGram * GRAMS_PER_TOLA;
  return usdPerTola * usdPkr;
}

async function fetchLiveGoldPrice(): Promise<GoldQuote | null> {
  try {
    const [goldRes, usdPkr] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU', {
        headers: { Accept: 'application/json' },
      }),
      fetchUsdPkrRate(),
    ]);
    if (!goldRes.ok) return null;
    const data = await goldRes.json();
    const price = Number(data.price ?? data.ask ?? data.bid);
    if (!Number.isFinite(price) || price <= 0) return null;
    const quote: GoldQuote = {
      price,
      currency: String(data.currency || 'USD'),
      symbol: 'XAU',
    };
    if (usdPkr) {
      quote.usdPkrRate = usdPkr;
      quote.pkrPerTolaApprox = Math.round(approxPkrPerTola(price, usdPkr));
    }
    return quote;
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

function storyQualityAdjust(title: string, description: string): number {
  let adj = 0;
  if (TEASER_TITLE_RE.test(title)) adj -= 12;
  if (NEWSLETTER_BOILERPLATE_RE.test(description)) adj -= 8;
  if (CONCRETE_EVENT_RE.test(title)) adj += 6;
  if (title.length < 28 && /updates?|news$/i.test(title)) adj -= 4;
  // Prefer specific headlines over vague blog indexes
  if (/\b(we announced|our blog|our latest)\b/i.test(title)) adj -= 6;
  return adj;
}

function collectMatchedTerms(
  item: NewsItem,
  primary: string[],
  expanded: string[],
): string[] {
  const hayTitle = item.title.toLowerCase();
  const hayDesc = (item.description || '').toLowerCase();
  const hits: string[] = [];
  for (const t of primary) {
    if (matchesAnyVariant(hayTitle, t) || matchesAnyVariant(hayDesc, t)) hits.push(t);
  }
  if (!hits.length) {
    for (const t of expanded) {
      if (matchesAnyVariant(hayTitle, t)) {
        hits.push(t);
        break;
      }
    }
  }
  return hits.slice(0, 3);
}

function scoreItem(
  item: NewsItem,
  primary: string[],
  expanded: string[],
  phrase: string,
  mode: 'strict' | 'relaxed' = 'strict',
): { matchScore: number; score: number; matchedTerms: string[] } {
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
  if (n === 0) return { matchScore: 0, score: 0, matchedTerms: [] };

  if (mode === 'strict') {
    if (n === 1) {
      if (titleHits < 1) return { matchScore: 0, score: 0, matchedTerms: [] };
    } else if (n === 2) {
      if (anywhereHits < 2 || titleHits < 1) return { matchScore: 0, score: 0, matchedTerms: [] };
    } else {
      const need = Math.ceil(n * 0.6);
      const phraseInTitle = phrase.length >= 4 && hayTitle.includes(phrase);
      if (anywhereHits < need) return { matchScore: 0, score: 0, matchedTerms: [] };
      if (titleHits < 1 && !phraseInTitle) return { matchScore: 0, score: 0, matchedTerms: [] };
    }
    matchScore += storyQualityAdjust(item.title, item.description || '');
    if (matchScore < 10) return { matchScore: 0, score: 0, matchedTerms: [] };
  } else {
    // Relaxed: any primary/expanded hit in title or description is enough.
    if (anywhereHits < 1 && titleHits < 1) {
      const softHit = expanded.some((t) => matchesAnyVariant(hayAll, t));
      if (!softHit) return { matchScore: 0, score: 0, matchedTerms: [] };
      matchScore += 4;
    }
    matchScore += storyQualityAdjust(item.title, item.description || '');
    if (matchScore < 4) return { matchScore: 0, score: 0, matchedTerms: [] };
  }

  let score = matchScore;
  const ageMs = Date.now() - new Date(item.publishedAt).getTime();
  if (ageMs < 6 * 60 * 60 * 1000) score += 2;
  else if (ageMs < 24 * 60 * 60 * 1000) score += 1;
  score += Math.min(2, Math.max(0, item.significance / 5));

  // Prefer Pakistan-relevant fuel/oil coverage when user asked about petrol/fuel.
  if (
    primary.some((t) => ['petrol', 'diesel', 'fuel', 'gasoline', 'oil'].includes(t)) ||
    expanded.includes('petrol')
  ) {
    if (/\b(pakistan|karachi|islamabad|lahore|ogra|pkr)\b/i.test(hayAll)) score += 8;
    if (/\b(crude|brent|wti|opec|petroleum|oil price|fuel)\b/i.test(hayTitle)) score += 4;
    // Demote US retail-gas betting/election noise for petrol asks.
    if (/\b(kalshi|election day|governors ball)\b/i.test(hayAll)) score -= 10;
  }

  return {
    matchScore,
    score,
    matchedTerms: collectMatchedTerms(item, primary, expanded),
  };
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const stamp = d.toLocaleString('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${stamp} PKT`;
  } catch {
    return '';
  }
}

function stripBoilerplate(desc: string): string {
  let s = desc.replace(/\s+/g, ' ').trim();
  s = s.replace(NEWSLETTER_BOILERPLATE_RE, ' ');
  s = s.replace(/^(this is today'?s edition[^.]*\.\s*)+/i, '');
  s = s.replace(
    /^our weekday newsletter that provides a daily dose of what'?s going on in the world of technology\.?\s*/i,
    '',
  );
  s = s.replace(/\|\s*Photo:[^.]*\.?/gi, ' ');
  s = s.replace(/Photo:\s*[^.]*\.\s*/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function waSummary(desc: string): string {
  const clean = stripBoilerplate(desc);
  if (!clean) return 'Open the source link for the full publisher article.';
  if (clean.length <= WA_SUMMARY_MAX) return clean;
  const sliced = clean.slice(0, WA_SUMMARY_MAX);
  const lastStop = Math.max(
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('! '),
    sliced.lastIndexOf('? '),
  );
  if (lastStop > 80) return sliced.slice(0, lastStop + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > 80) return sliced.slice(0, lastSpace).trimEnd() + '...';
  return sliced.trimEnd() + '...';
}

function buildBrief(
  items: QueryResultItem[],
  topicLabel: string,
  weather?: WeatherPayload | null,
  poolSize = 0,
  soft = false,
): string {
  if (weather?.error) return weather.error;
  if (weather && !weather.error && weather.location) {
    return `Live conditions for ${weather.location}.`;
  }
  if (items.length === 0) {
    if (poolSize === 0) {
      return `NewsDash feeds are still syncing. Open the dashboard once, wait a few seconds, then ask again.`;
    }
    return `No fresh matching story for "${topicLabel}" in the current NewsDash feed window.`;
  }
  if (soft) {
    return items.length === 1
      ? 'Closest matching story from NewsDash.'
      : 'Closest matching stories from NewsDash.';
  }
  return items.length === 1
    ? 'Top matching story from NewsDash.'
    : `${items.length} matching stories from NewsDash.`;
}

function buildWeatherBlock(weather: WeatherPayload): string {
  if (weather.error) return `*Live weather*\n${weather.error}`;
  return [
    '*Live weather*',
    `*${weather.location || 'Unknown'}* - ${weather.condition || '-'}`,
    `${weather.temperature ?? '-'} C (feels ${weather.feelsLike ?? '-'} C) | Humidity ${weather.humidity ?? '-'}% | Wind ${weather.windKmh ?? '-'} km/h`,
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

function sourceHyperlink(source: string, url: string): string {
  const outlet = source?.trim() || 'Publisher';
  return [`*Source:* ${outlet}`, url.trim()].join('\n');
}

function matchMetaLine(i: QueryResultItem): string {
  const terms = (i.matchedTerms || []).map((t) => titleCaseWords(t)).filter(Boolean);
  const left = terms.length ? terms.join(', ') : 'topic';
  const outlet = i.source?.trim() || 'NewsDash';
  return `_Matched: ${left} | ${outlet}_`;
}

function formatNewsStoryBlock(i: QueryResultItem, idx: number, showIndex: boolean): string {
  const when = formatTime(i.publishedAt);
  const title = showIndex ? `*${idx + 1}. ${i.title.trim()}*` : `*${i.title.trim()}*`;
  const lines = [
    title,
    matchMetaLine(i),
    when ? `_Published ${when}_` : '',
    waSummary(i.description || ''),
  ];
  if (isValidArticleUrl(i.url)) {
    lines.push(sourceHyperlink(i.source, i.url));
  }
  return lines.filter(Boolean).join('\n');
}

function buildWhatsAppText(
  topicLabel: string,
  brief: string,
  items: QueryResultItem[],
  weather?: WeatherPayload | null,
): string {
  const withUrls = items.filter((i) => isValidArticleUrl(i.url));
  const parts = ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, brief];

  if (weather && (weather.location || weather.error)) {
    parts.push('', buildWeatherBlock(weather));
  }

  if (!withUrls.length) return parts.join('\n');

  const showIndex = withUrls.length > 1;
  parts.push('', withUrls.map((i, idx) => formatNewsStoryBlock(i, idx, showIndex)).join('\n\n'));
  return parts.join('\n');
}

function buildGoldWhatsApp(topicLabel: string, gold: GoldQuote): string {
  const brief = 'Live gold spot (international).';
  const lines = [
    '*Live gold price*',
    `*XAU/USD* - $${gold.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} / oz`,
  ];
  if (gold.pkrPerTolaApprox && gold.usdPkrRate) {
    lines.push(
      `*Approx PKR/tola* - Rs ${gold.pkrPerTolaApprox.toLocaleString('en-PK')} (converted @ ${gold.usdPkrRate.toFixed(2)} PKR/USD)`,
      '_Converted estimate — local jewellery rates may differ._',
    );
  }
  lines.push('_Updated just now_');
  return ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, brief, '', lines.join('\n')].join(
    '\n',
  );
}

function buildCryptoWhatsApp(topicLabel: string, quote: CryptoQuote): string {
  const ch =
    quote.change24h == null
      ? ''
      : ` | 24h ${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%`;
  const brief = `Live ${quote.name} price.`;
  const block = [
    `*Live ${quote.name} price*`,
    `*${quote.symbol}/USD* - $${quote.usd.toLocaleString('en-US', {
      maximumFractionDigits: quote.usd >= 100 ? 2 : 4,
    })}${ch}`,
    '_Updated just now_',
  ].join('\n');
  return ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, brief, '', block].join('\n');
}

/** Prefer market/fuel coverage in the title — not a weak description mention. */
function isUsefulFuelHeadline(item: NewsItem): boolean {
  const title = item.title.toLowerCase();
  const hay = `${item.title} ${item.description || ''}`.toLowerCase();
  if (/\b(kalshi|election day)\b/.test(hay) && /\bgas prices?\b/.test(hay)) return false;
  return /\b(oil|crude|brent|wti|petroleum|petrol|diesel|fuel|gasoline|opec)\b/.test(title);
}

function buildFuelNewsWhatsApp(topicLabel: string, oilItems: QueryResultItem[]): string {
  const withUrls = oilItems.filter((i) => isValidArticleUrl(i.url));
  const brief = withUrls.length
    ? 'Live Pakistan pump prices are not wired yet. Here is the latest oil/fuel coverage from NewsDash (with source links).'
    : 'Live Pakistan pump prices are not wired yet, and no fresh oil/fuel headline is in the current NewsDash window.';
  const parts = ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, brief];
  if (withUrls.length) {
    const showIndex = withUrls.length > 1;
    parts.push('', withUrls.map((i, idx) => formatNewsStoryBlock(i, idx, showIndex)).join('\n\n'));
  }
  return parts.join('\n');
}

function fallbackWhatsApp(topicLabel: string, reason: string): string {
  return ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, reason].join('\n');
}

/** Quality gate: never send wrong-city weather or empty "successful" prices. */
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
            reason: `Could not confirm weather for "${requestedCity}". Try a clearer city name.`,
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

function titlesTooSimilar(a: string, b: string): boolean {
  const ta = new Set(
    cleanQuery(a)
      .split(/\s+/g)
      .filter((w) => w.length > 3),
  );
  const tb = cleanQuery(b)
    .split(/\s+/g)
    .filter((w) => w.length > 3);
  if (!tb.length) return false;
  let overlap = 0;
  for (const w of tb) if (ta.has(w)) overlap += 1;
  return overlap / tb.length >= 0.55;
}

function isTeaserStory(item: NewsItem): boolean {
  return (
    TEASER_TITLE_RE.test(item.title) ||
    NEWSLETTER_BOILERPLATE_RE.test(item.description || '') ||
    /\b(we announced|our latest)\b/i.test(item.title)
  );
}

function pickStories(scored: QueryResultItem[], limit: number): QueryResultItem[] {
  if (!scored.length || limit <= 0) return [];
  const preferred = scored.filter((i) => !isTeaserStory(i));
  const pool = preferred.length ? preferred : scored;
  const out: QueryResultItem[] = [pool[0]];
  for (const cand of pool.slice(1)) {
    if (out.length >= limit) break;
    const tooClose = out.some(
      (prev) =>
        titlesTooSimilar(prev.title, cand.title) ||
        (prev.source && cand.source && prev.source === cand.source && titlesTooSimilar(prev.title, cand.title)),
    );
    if (!tooClose) out.push(cand);
  }
  // If diversity filter was too aggressive, fill remaining slots.
  for (const cand of pool.slice(1)) {
    if (out.length >= limit) break;
    if (!out.some((p) => p.id === cand.id)) out.push(cand);
  }
  return out;
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
  soft: boolean;
}> {
  let primary = tokenize(q);
  let expanded = expandTerms(q);
  const phrase = cleanQuery(q);
  const inferred = inferCategories(q);
  const allowed = categories && categories.length > 0 ? categories : inferred;

  // Fuel/petrol natural language → search oil/fuel cluster.
  if (
    /\b(petrol|diesel|gasoline|fuel|pump)\b/.test(phrase) ||
    (/\bgas\b/.test(phrase) && /\b(price|prices|rate|cost)\b/.test(phrase))
  ) {
    primary = Array.from(new Set(['petrol', 'oil', 'fuel', ...primary]));
    expanded = Array.from(
      new Set([
        ...expanded,
        ...expandTerms('petrol oil fuel crude petroleum'),
        'pakistan',
      ]),
    );
  }

  const fresh = await loadFreshItems();
  const poolSize = fresh.length;

  const rank = (list: QueryResultItem[]) =>
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

  const scorePool = (terms: string[], exp: string[], mode: 'strict' | 'relaxed', minScore: number) =>
    rank(
      fresh
        .filter((i) => isValidArticleUrl(i.url))
        .map((i) => {
          const { matchScore, score, matchedTerms } = scoreItem(i, terms, exp, phrase, mode);
          return { ...i, score, matchScore, matchedTerms };
        })
        .filter((i) => i.matchScore >= minScore),
    );

  let soft = false;
  let scored = primary.length ? scorePool(primary, expanded, 'strict', 10) : [];

  if (scored.length === 0 && primary.length > 2) {
    primary = fallbackPrimary(primary);
    expanded = expandTerms(primary.join(' '));
    scored = scorePool(primary, expanded, 'strict', 10);
  }

  if (scored.length === 0) {
    const topic = topicFromPhrase(q);
    if (topic) {
      primary = Array.from(new Set([topic, ...primary]));
      expanded = expandTerms([...primary, topic].join(' '));
      scored = scorePool(primary, expanded, 'strict', 10);
    }
  }

  // Tier: relaxed matching so natural questions still get sourced news.
  if (scored.length === 0 && (primary.length || expanded.length)) {
    soft = true;
    scored = scorePool(
      primary.length ? primary : expanded.slice(0, 3),
      expanded,
      'relaxed',
      4,
    );
  }

  // Tier: category browse from inferred/dashboard categories.
  if (scored.length === 0 && allowed.length) {
    soft = true;
    scored = rank(
      fresh
        .filter((i) => isValidArticleUrl(i.url) && allowed.includes(i.category))
        .map((i) => ({
          ...i,
          matchScore: 6,
          score: Math.min(8, i.significance) + 2,
          matchedTerms: allowed.slice(0, 2),
        })),
    );
  }

  // Do NOT invent relevance for gibberish: only browse globally when we know the topic family.
  if (scored.length === 0 && (topicFromPhrase(q) || allowed.length > 0)) {
    soft = true;
    scored = rank(
      fresh
        .filter((i) => isValidArticleUrl(i.url))
        .map((i) => ({
          ...i,
          matchScore: 5,
          score: Math.min(8, i.significance),
          matchedTerms: primary.slice(0, 2),
        })),
    );
  }

  return {
    items: pickStories(scored, limit),
    total: scored.length,
    poolSize,
    primary,
    expanded,
    allowed,
    soft,
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
  const limit = Math.min(
    Math.max(body.limit ?? WA_STORY_LIMIT, 1),
    WA_STORY_LIMIT_MAX,
  );
  const intent = resolveIntent(q);
  const topicLabel = displayTopic(q, intent);
  const now = new Date().toISOString();

  if (intent.kind === 'weather') {
    const weather = await fetchDashboardWeather(intent.city, intent.cityAsked);
    const brief = buildBrief([], topicLabel, weather, 0);
    let whatsappText = buildWhatsAppText(topicLabel, brief, [], weather);
    const gate = assertReplyQuality({
      intent: 'weather',
      whatsappText,
      weather,
      requestedCity: intent.cityAsked ? intent.city : undefined,
    });
    if (!gate.ok) {
      whatsappText = fallbackWhatsApp(topicLabel, gate.reason);
    }
    return Response.json({
      query: q,
      displayTopic: topicLabel,
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
      let whatsappText = buildGoldWhatsApp(topicLabel, gold);
      const gate = assertReplyQuality({
        intent: 'gold_price',
        whatsappText,
        goldPrice: gold,
      });
      if (!gate.ok) whatsappText = fallbackWhatsApp(topicLabel, gate.reason);
      return Response.json({
        query: q,
        displayTopic: topicLabel,
        rawQuery: rawQ,
        intent: intent.kind,
        categories: ['trading'],
        brief: 'Live gold spot (international).',
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
      let whatsappText = buildCryptoWhatsApp(topicLabel, quote);
      const gate = assertReplyQuality({
        intent: 'crypto_price',
        whatsappText,
        cryptoPrice: quote,
      });
      if (!gate.ok) whatsappText = fallbackWhatsApp(topicLabel, gate.reason);
      return Response.json({
        query: q,
        displayTopic: topicLabel,
        rawQuery: rawQ,
        intent: intent.kind,
        categories: ['crypto'],
        brief: `Live ${quote.name} price.`,
        items: [],
        total: 1,
        whatsappText,
        cryptoPrice: quote,
        lastUpdated: now,
      });
    }
  }

  if (intent.kind === 'unsupported_live') {
    // Never invent pump prices — but always answer with real oil/fuel news + source links.
    const oil = await searchNews('petrol oil fuel crude petroleum pakistan', 8, ['trading']);
    const fuelish = oil.items.filter(isUsefulFuelHeadline);
    const chosen = (fuelish.length ? fuelish : oil.items).slice(0, 2);
    const whatsappText = buildFuelNewsWhatsApp(topicLabel, chosen);
    return Response.json({
      query: q,
      displayTopic: topicLabel,
      rawQuery: rawQ,
      intent: intent.kind,
      categories: ['trading'],
      brief:
        'Live Pakistan pump prices are not wired yet. Latest oil/fuel coverage from NewsDash.',
      items: chosen,
      total: chosen.length,
      poolSize: oil.poolSize,
      soft: oil.soft,
      whatsappText,
      linkPreview: linkPreviewFromItems(chosen),
      linkPreviewEnabled: chosen.length > 0,
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
    const msg =
      'Please ask about a topic (for example AI, oil, bitcoin, Pakistan markets, or a company name).';
    return Response.json({
      query: q,
      displayTopic: topicLabel,
      rawQuery: rawQ,
      intent: 'news',
      categories: [],
      brief: msg,
      items: [],
      total: 0,
      whatsappText: buildWhatsAppText(topicLabel, msg, []),
      lastUpdated: now,
    });
  }

  const searched = await searchNews(
    newsQ,
    limit,
    body.categories && body.categories.length > 0 ? body.categories : undefined,
  );

  const brief = buildBrief(
    searched.items,
    topicLabel,
    null,
    searched.poolSize,
    searched.soft,
  );
  let whatsappText = buildWhatsAppText(topicLabel, brief, searched.items);
  const gate = assertReplyQuality({
    intent: 'news',
    whatsappText,
    items: searched.items,
  });
  if (!gate.ok && searched.items.length > 0) {
    whatsappText = fallbackWhatsApp(topicLabel, gate.reason);
  }

  const preview = linkPreviewFromItems(searched.items);

  return Response.json({
    query: q,
    displayTopic: topicLabel,
    rawQuery: rawQ,
    intent: 'news',
    categories: searched.allowed,
    terms: { primary: searched.primary, expanded: searched.expanded },
    brief,
    items: searched.items,
    total: searched.total,
    poolSize: searched.poolSize,
    soft: searched.soft,
    whatsappText,
    linkPreview: preview,
    linkPreviewEnabled: Boolean(preview),
    lastUpdated: now,
  });
}
