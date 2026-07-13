import { getFeedItemsForQuery } from '@/lib/feeds/fetch-all-feeds';
import { isFresh } from '@/lib/feeds/date-utils';
import { resolveArticleBodies } from '@/lib/feeds/article-body';
import {
  buildExtractiveAnswer,
  buildGroundedAnswer,
  type GroundedSource,
} from '@/lib/query/grounded-answer';
import type { Category, NewsItem } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Universal NewsDash query brain:
 *   any question → retrieve from all feeds → rank → cite with source URLs
 * Live weather/price are tiny plugins only when explicitly requested.
 */

type QueryRequest = {
  q: string;
  limit?: number;
  categories?: Category[];
};

type QueryResultItem = NewsItem & {
  score: number;
  matchScore: number;
  matchedTerms: string[];
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

type PluginKind = 'greeting' | 'weather' | 'gold_price' | 'crypto_price' | 'news';

type Plugin =
  | { kind: 'greeting' }
  | { kind: 'weather'; city: string; cityAsked: boolean }
  | { kind: 'gold_price' }
  | { kind: 'crypto_price'; cryptoId: string }
  | { kind: 'news' };

const STOP_WORDS = new Set([
  'tell', 'me', 'about', 'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at',
  'is', 'are', 'was', 'were', 'be', 'news', 'what', 'whats', "what's", 'who', 'when', 'where',
  'why', 'how', 'please', 'give', 'show', 'get', 'latest', 'update', 'updates',
  'today', 'now', 'some', 'any', 'info', 'information', 'regarding', 'related', 'something',
  'everything', 'thing', 'things', 'from', 'with', 'into', 'over', 'under', 'again',
  'can', 'you', 'could', 'would', 'need', 'want', 'looking', 'know', 'explain', 'describe',
  'detail', 'details', 'summary', 'brief', 'quick', 'currently', 'happening', 'happens',
  'there', 'this', 'that', 'these', 'those', 'also', 'just', 'really', 'very',
  'claiming', 'against', 'between', 'versus', 'vs', 'does', 'did', 'doing', 'been',
  'have', 'has', 'had', 'will', 'should', 'their', 'they', 'them', 'its', 'into',
]);

/** Light query expansion only — never the main brain. Unknown words still search feeds. */
const LIGHT_EXPAND: Record<string, string[]> = {
  tech: ['technology', 'software', 'hardware'],
  technology: ['tech', 'software', 'hardware', 'ai'],
  technologies: ['tech', 'technology', 'software'],
  btc: ['bitcoin'],
  eth: ['ethereum'],
  sol: ['solana'],
  petrol: ['oil', 'crude', 'fuel', 'petroleum'],
  diesel: ['oil', 'crude', 'fuel', 'petroleum'],
  gasoline: ['oil', 'crude', 'fuel', 'petroleum'],
  fuel: ['oil', 'crude', 'petroleum', 'petrol'],
  ml: ['ai', 'machine learning'],
  llm: ['ai'],
  gpt: ['openai', 'ai'],
  war: ['conflict', 'strike', 'attack', 'military', 'invasion', 'bombing'],
  wars: ['war', 'conflict', 'strike', 'attack'],
  lebanon: ['lebanese', 'hezbollah', 'beirut', 'israel'],
  lebanese: ['lebanon', 'hezbollah', 'beirut'],
  iran: ['iranian', 'tehran', 'strike', 'israel'],
  iranian: ['iran', 'tehran'],
  israel: ['israeli', 'gaza', 'hezbollah', 'iran', 'lebanon'],
  gaza: ['israel', 'palestinian', 'hamas'],
  ukraine: ['ukrainian', 'russia', 'kyiv'],
  russia: ['russian', 'ukraine', 'moscow'],
};

const ENTITY_BLOCKLIST: Record<string, string[]> = {
  gold: ['goldman', 'golden', 'goldberg', 'goldstein'],
};

const TEASER_RE =
  /\b(the download|round-?up|daily digest|weekly wrap|here'?s what happened|newsletter|hodler'?s digest|state of crypto|things to know|top \d+)\b/i;
const BOILERPLATE_RE =
  /this is today'?s edition|weekday newsletter|daily dose of what'?s going on|subscribe to|photo:/i;

const WA_SUMMARY_MAX = 200;
const WA_STORY_LIMIT = 2;
const WA_STORY_LIMIT_MAX = 2;
const WA_ANSWER_MIN = 40;
const MIN_MATCH = 8;
const GRAMS_PER_TROY_OZ = 31.1034768;
const GRAMS_PER_TOLA = 11.6638038;

function clean(q: string): string {
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
    /^(tell me|tell us|give me|show me|get me|i want|i need|looking for|explain|describe)\s+(about\s+|regarding\s+|on\s+|for\s+|to know about\s+)?/i,
    '',
  );
  q = q.replace(/^(what(?:'s| is| are)|whats)\s+(the\s+)?(latest\s+|current\s+)?/i, '');
  q = q.replace(/^(any|some)\s+(news|updates?|info|information)\s+(on|about|regarding)\s+/i, '');
  q = q.replace(/\?+$/g, '').trim();
  return q || String(raw || '').trim();
}

function tokenize(q: string): string[] {
  return clean(q)
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

function expandTokens(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) {
    for (const x of LIGHT_EXPAND[t] || []) out.add(x);
  }
  return [...out];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWord(hay: string, term: string): boolean {
  if (!term) return false;
  const re = new RegExp(`(^|[^a-z0-9_+-])${escapeRegex(term)}([^a-z0-9_+-]|$)`, 'i');
  if (!re.test(hay)) return false;
  const blocked = ENTITY_BLOCKLIST[term.toLowerCase()];
  if (!blocked?.length) return true;
  const scrubbed = blocked.reduce(
    (acc, b) => acc.replace(new RegExp(escapeRegex(b), 'gi'), ' '),
    hay,
  );
  return re.test(scrubbed);
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

function isGreeting(q: string): boolean {
  return /^(hi|hello|hey|salam|assalamualaikum|hola|yo|thanks|thank you|ok|okay|help|start|menu)$/.test(
    clean(q),
  );
}

function wantsLivePrice(q: string): boolean {
  return /\b(price|prices|spot|rate|rates|cost|how much|worth|trading at|quote|increasing|decreasing|up or down|going up|going down|rose|fell|rally|dump)\b/.test(
    clean(q),
  );
}

/** e.g. "62899 or 62829 ?" after a BTC quote — treat as live bitcoin ask */
function isPriceClarifyQuery(q: string): boolean {
  const s = clean(q).replace(/\?/g, '').trim();
  return /^\d{3,7}(\s*(or|vs|versus|to|-|\/)\s*\d{3,7})?$/.test(s);
}

function detectPlugin(q: string): Plugin {
  const s = clean(q);
  if (isGreeting(s)) return { kind: 'greeting' };

  if (
    /^(weather|forecast|temperature|humidity)$/.test(s) ||
    (/\b(weather|forecast|temperature|humidity)\b/.test(s) &&
      !/\b(oil|stock|market|bitcoin|crypto|gold|ai|nvidia|news)\b/.test(s))
  ) {
    let city = s
      .replace(
        /\b(weather|forecast|temperature|humidity|today|now|current|please|tell|me|about|of|in|for|the|a|an)\b/g,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();
    if (!city) return { kind: 'weather', city: 'London', cityAsked: false };
    return { kind: 'weather', city, cityAsked: true };
  }

  if (isPriceClarifyQuery(s)) {
    return { kind: 'crypto_price', cryptoId: 'bitcoin' };
  }

  if (wantsLivePrice(s) || /\b(increasing|decreasing|up or down)\b/.test(s)) {
    if (/\b(gold|xau|bullion)\b/.test(s)) return { kind: 'gold_price' };
    if (/\b(bitcoin|btc)\b/.test(s)) return { kind: 'crypto_price', cryptoId: 'bitcoin' };
    if (/\b(ethereum|eth)\b/.test(s)) return { kind: 'crypto_price', cryptoId: 'ethereum' };
    if (/\b(solana|sol)\b/.test(s)) return { kind: 'crypto_price', cryptoId: 'solana' };
  }

  return { kind: 'news' };
}

function displayTopic(q: string, plugin: Plugin): string {
  if (plugin.kind === 'greeting') return 'Help';
  if (plugin.kind === 'weather') {
    return plugin.cityAsked
      ? `${titleCase(plugin.city)} weather`
      : 'Weather';
  }
  if (plugin.kind === 'gold_price') return 'Gold price';
  if (plugin.kind === 'crypto_price') {
    const map: Record<string, string> = {
      bitcoin: 'Bitcoin price',
      ethereum: 'Ethereum price',
      solana: 'Solana price',
    };
    return map[plugin.cryptoId] || 'Crypto price';
  }
  const tokens = tokenize(q);
  if (!tokens.length) return 'News';
  return titleCase(tokens.slice(0, 5).join(' '));
}

function titleCase(s: string): string {
  return s
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) =>
      /^(ai|btc|eth|usd|pkr|nft|gpu|ipo)$/i.test(w)
        ? w.toUpperCase()
        : w[0].toUpperCase() + w.slice(1),
    )
    .join(' ');
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return (
      d.toLocaleString('en-GB', {
        timeZone: 'Asia/Karachi',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }) + ' PKT'
    );
  } catch {
    return '';
  }
}

function stripBoilerplate(desc: string): string {
  let s = desc.replace(/\s+/g, ' ').trim();
  s = s.replace(BOILERPLATE_RE, ' ');
  s = s.replace(/\|\s*Photo:[^.]*\.?/gi, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function waSummary(desc: string): string {
  const cleanDesc = stripBoilerplate(desc);
  if (!cleanDesc) return 'Open the source link for the full publisher article.';
  if (cleanDesc.length <= WA_SUMMARY_MAX) return cleanDesc;
  const sliced = cleanDesc.slice(0, WA_SUMMARY_MAX);
  const stop = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '));
  if (stop > 80) return sliced.slice(0, stop + 1);
  const space = sliced.lastIndexOf(' ');
  return (space > 80 ? sliced.slice(0, space) : sliced).trimEnd() + '...';
}

function isTeaser(item: NewsItem): boolean {
  return TEASER_RE.test(item.title) || BOILERPLATE_RE.test(item.description || '');
}

/** Core relevance scoring — works for any topic tokens from the user query. */
function scoreAgainstQuery(
  item: NewsItem,
  tokens: string[],
  expanded: string[],
  phrase: string,
): { matchScore: number; score: number; matchedTerms: string[] } {
  const title = item.title.toLowerCase();
  const desc = (item.description || '').toLowerCase();
  const tags = (item.tags || []).join(' ').toLowerCase();
  const all = `${title} ${desc} ${tags} ${item.category} ${item.source}`.toLowerCase();

  let matchScore = 0;
  let titleHits = 0;
  let anywhereHits = 0;
  const matched: string[] = [];

  if (phrase.length >= 4) {
    if (title.includes(phrase)) matchScore += 22;
    else if (desc.includes(phrase)) matchScore += 8;
  }

  const consider = (t: string, weightTitle: number, weightOther: number) => {
    if (!t) return;
    if (hasWord(title, t) || (t.length >= 4 && title.includes(t))) {
      matchScore += weightTitle;
      titleHits += 1;
      anywhereHits += 1;
      matched.push(t);
      return;
    }
    if (hasWord(desc, t) || hasWord(tags, t) || hasWord(all, t) || (t.length >= 4 && all.includes(t))) {
      matchScore += weightOther;
      anywhereHits += 1;
      matched.push(t);
    }
  };

  for (const t of tokens) consider(t, 14, 6);

  for (const t of expanded) {
    if (tokens.includes(t)) continue;
    consider(t, 8, 3);
  }

  // Category boost for broad tech asks.
  if (
    tokens.some((t) => ['tech', 'technology', 'technologies', 'ai'].includes(t)) &&
    (item.category === 'tech' || item.category === 'ai' || item.category === 'github')
  ) {
    matchScore += 10;
    if (titleHits < 1) titleHits = 1;
    if (anywhereHits < 1) anywhereHits = 1;
    matched.push('tech');
  }

  if (!tokens.length) return { matchScore: 0, score: 0, matchedTerms: [] };

  // Single-token: require a title/category signal (synonyms count via expanded).
  if (tokens.length === 1 && titleHits < 1) {
    return { matchScore: 0, score: 0, matchedTerms: [] };
  }

  // Two-token: at least one title hit and one term anywhere (not both required everywhere).
  if (tokens.length === 2) {
    if (titleHits < 1 || anywhereHits < 1) {
      return { matchScore: 0, score: 0, matchedTerms: [] };
    }
  }

  // Longer asks: at least one title hit and ~half the terms.
  if (tokens.length > 2) {
    const need = Math.max(1, Math.ceil(tokens.length * 0.5));
    if (anywhereHits < need || titleHits < 1) {
      return { matchScore: 0, score: 0, matchedTerms: [] };
    }
  }

  if (isTeaser(item)) matchScore -= 10;
  if (/\b(announce[sd]?|launch|sue[sd]?|ban[s]?|strike|acquire|ipo|surge|crash|attack|war)\b/i.test(item.title)) {
    matchScore += 4;
  }

  if (matchScore < MIN_MATCH) return { matchScore: 0, score: 0, matchedTerms: [] };

  let score = matchScore;
  const ageMs = Date.now() - new Date(item.publishedAt).getTime();
  if (ageMs < 6 * 60 * 60 * 1000) score += 3;
  else if (ageMs < 24 * 60 * 60 * 1000) score += 1;
  score += Math.min(2, Math.max(0, item.significance / 5));

  return {
    matchScore,
    score,
    matchedTerms: matched.filter((t, i, a) => a.indexOf(t) === i).slice(0, 4),
  };
}

function titlesTooSimilar(a: string, b: string): boolean {
  const ta = new Set(clean(a).split(/\s+/g).filter((w) => w.length > 3));
  const tb = clean(b).split(/\s+/g).filter((w) => w.length > 3);
  if (!tb.length) return false;
  let overlap = 0;
  for (const w of tb) if (ta.has(w)) overlap += 1;
  return overlap / tb.length >= 0.55;
}

function pickDiverse(items: QueryResultItem[], limit: number): QueryResultItem[] {
  if (!items.length || limit <= 0) return [];
  const preferred = items.filter((i) => !isTeaser(i));
  const pool = preferred.length ? preferred : items;
  const out: QueryResultItem[] = [pool[0]];
  for (const cand of pool.slice(1)) {
    if (out.length >= limit) break;
    if (out.some((p) => titlesTooSimilar(p.title, cand.title))) continue;
    out.push(cand);
  }
  for (const cand of pool.slice(1)) {
    if (out.length >= limit) break;
    if (!out.some((p) => p.id === cand.id)) out.push(cand);
  }
  return out;
}

/**
 * Universal retrieve → rank over the entire NewsDash feed cache.
 * No topic whitelist: any tokens from the user query can match.
 */
async function retrieveAndRank(
  q: string,
  limit: number,
  categories?: Category[],
): Promise<{
  items: QueryResultItem[];
  total: number;
  poolSize: number;
  tokens: string[];
  expanded: string[];
}> {
  const tokens = tokenize(q);
  const expanded = expandTokens(tokens);
  const phrase = clean(q);

  const all = await getFeedItemsForQuery().catch(() => [] as NewsItem[]);
  let fresh = all.filter((i) => i?.id && isFresh(i.publishedAt) && isValidArticleUrl(i.url));
  if (categories?.length) {
    const scoped = fresh.filter((i) => categories.includes(i.category));
    if (scoped.length) fresh = scoped;
  }

  if (!tokens.length) {
    return { items: [], total: 0, poolSize: fresh.length, tokens, expanded };
  }

  // Pass 1: strict title-first ranking
  let scored = fresh
    .map((i) => {
      const { matchScore, score, matchedTerms } = scoreAgainstQuery(i, tokens, expanded, phrase);
      return { ...i, matchScore, score, matchedTerms };
    })
    .filter((i) => i.matchScore >= MIN_MATCH)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

  // Pass 2: if empty, try longest tokens only (natural language leftovers)
  if (!scored.length && tokens.length > 2) {
    const focus = [...tokens].sort((a, b) => b.length - a.length).slice(0, 2);
    const exp = expandTokens(focus);
    scored = fresh
      .map((i) => {
        const { matchScore, score, matchedTerms } = scoreAgainstQuery(i, focus, exp, phrase);
        return { ...i, matchScore, score, matchedTerms };
      })
      .filter((i) => i.matchScore >= MIN_MATCH)
      .sort((a, b) => b.score - a.score);
  }

  // Pass 3: soft title/category fallback for remaining tokens
  if (!scored.length) {
    const focus = tokens.filter((t) => t.length >= 3);
    const use = focus.length ? focus : tokens;
    const exp = expandTokens(use);
    scored = fresh
      .map((i) => {
        const title = i.title.toLowerCase();
        const desc = (i.description || '').toLowerCase();
        const hay = `${title} ${desc} ${i.category} ${i.source}`.toLowerCase();
        const hit =
          use.find((t) => hasWord(title, t) || (t.length >= 4 && title.includes(t))) ||
          exp.find((t) => hasWord(title, t) || (t.length >= 4 && title.includes(t)));
        const softHit =
          !hit &&
          (use.some((t) => hay.includes(t)) ||
            exp.some((t) => hay.includes(t)) ||
            (use.some((t) => ['tech', 'technology', 'technologies'].includes(t)) &&
              (i.category === 'tech' || i.category === 'ai')));
        if (!hit && !softHit) return null;
        const term = hit || use[0];
        const matchScore = hit ? 10 + Math.min(8, term.length) : 8;
        return {
          ...i,
          matchScore,
          score: matchScore + Math.min(2, i.significance / 5),
          matchedTerms: [term],
        } as QueryResultItem;
      })
      .filter((i): i is QueryResultItem => Boolean(i))
      .sort((a, b) => b.score - a.score);
  }

  // Pass 4: broad category fallback for tech/technology asks
  if (
    !scored.length &&
    tokens.some((t) => ['tech', 'technology', 'technologies', 'ai'].includes(t))
  ) {
    scored = fresh
      .filter((i) => i.category === 'tech' || i.category === 'ai' || i.category === 'github')
      .slice(0, 40)
      .map((i) => ({
        ...i,
        matchScore: 9,
        score: 9 + Math.min(2, i.significance / 5),
        matchedTerms: ['tech'],
      }))
      .sort((a, b) => b.score - a.score);
  }

  return {
    items: pickDiverse(scored, limit),
    total: scored.length,
    poolSize: fresh.length,
    tokens,
    expanded,
  };
}

/** Common Whisper/STT mishearings for cities we serve often */
const CITY_ALIASES: Record<string, string> = {
  'fish hour': 'Peshawar',
  fishhour: 'Peshawar',
  'fish our': 'Peshawar',
  'pishawar': 'Peshawar',
  'peshawar': 'Peshawar',
  'peshwar': 'Peshawar',
  'peshawer': 'Peshawar',
  'islam abad': 'Islamabad',
  'isloambad': 'Islamabad',
  'rawal pindi': 'Rawalpindi',
  'lahore': 'Lahore',
  'karachi': 'Karachi',
};

function normalizeCityQuery(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return CITY_ALIASES[key] || name.trim();
}

async function geocode(name: string): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const q = normalizeCityQuery(name);
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' +
      encodeURIComponent(q);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data?.results) ? data.results[0] : null;
    if (!hit) return null;
    return {
      lat: Number(hit.latitude),
      lon: Number(hit.longitude),
      label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
    };
  } catch {
    return null;
  }
}

async function fetchWeather(city: string, cityAsked: boolean): Promise<WeatherPayload | null> {
  try {
    const asked = normalizeCityQuery(city);
    const geo = await geocode(asked);
    if (cityAsked && !geo) {
      return {
        error: `Could not find location "${asked}". Try a clearer city name.`,
        requestedCity: asked,
      };
    }
    const lat = geo?.lat ?? 51.5074;
    const lon = geo?.lon ?? -0.1278;
    const label = geo?.label ?? 'London, UK';
    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
        '&timezone=auto',
      { headers: { Accept: 'application/json' } },
    );
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
      requestedCity: cityAsked ? asked : undefined,
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

async function fetchUsdPkr(): Promise<number | null> {
  for (const url of [
    'https://open.er-api.com/v6/latest/USD',
    'https://api.exchangerate-api.com/v4/latest/USD',
  ]) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const rate = Number(data?.rates?.PKR);
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch {
      // try next
    }
  }
  return null;
}

async function fetchGold(): Promise<GoldQuote | null> {
  try {
    const [goldRes, usdPkr] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU', { headers: { Accept: 'application/json' } }),
      fetchUsdPkr(),
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
      quote.pkrPerTolaApprox = Math.round(
        (price / GRAMS_PER_TROY_OZ) * GRAMS_PER_TOLA * usdPkr,
      );
    }
    return quote;
  } catch {
    return null;
  }
}

async function fetchCrypto(id: string): Promise<CryptoQuote | null> {
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

/** WhatsApp auto-linkifies the https URL inside markdown [label](url). */
function sourceHyperlink(source: string, url: string): string {
  const href = url.trim();
  const label = (source || 'Open article').replace(/[\[\]]/g, '').trim() || 'Open article';
  return `Go to: [${label}](${href})`;
}

function formatSourceLine(i: QueryResultItem, idx: number, showIndex: boolean): string {
  const when = formatTime(i.publishedAt);
  const prefix = showIndex ? `*${idx + 1}. ${i.title.trim()}*` : `*${i.title.trim()}*`;
  const meta = [i.source || 'Publisher', when].filter(Boolean).join(' · ');
  return [prefix + (meta ? ` — ${meta}` : ''), sourceHyperlink(i.source || 'Publisher', i.url)]
    .filter(Boolean)
    .join('\n');
}

async function enrichGroundedSources(items: QueryResultItem[]): Promise<GroundedSource[]> {
  const bodies = await resolveArticleBodies(
    items.map((i) => ({
      url: i.url,
      description: i.description || '',
      title: i.title,
    })),
  );
  return items.map((i, idx) => ({
    title: i.title,
    source: i.source || 'Publisher',
    url: i.url,
    publishedAt: i.publishedAt,
    body: bodies[idx] || i.description || i.title,
  }));
}

async function buildNewsReply(
  question: string,
  topicLabel: string,
  items: QueryResultItem[],
  poolSize: number,
  note?: string,
): Promise<{ text: string; answer: string; sources: GroundedSource[] }> {
  const parts = ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`];
  if (note) parts.push(note);

  if (!items.length) {
    const empty =
      poolSize === 0
        ? 'NewsDash feeds are still syncing. Please try again in a moment.'
        : `No strong matching story for "${topicLabel}" in your NewsDash feeds right now. Try another keyword, or add an RSS source that covers that topic.`;
    parts.push(empty);
    return { text: parts.join('\n'), answer: '', sources: [] };
  }

  const sources = await enrichGroundedSources(items);
  let answer = await buildGroundedAnswer(question, sources);
  if (!answer || answer.length < WA_ANSWER_MIN) {
    answer = buildExtractiveAnswer(question, sources);
  }

  parts.push('', '*Answer:*', answer, '', '*Sources*');
  const showIndex = items.length > 1;
  parts.push(items.map((i, idx) => formatSourceLine(i, idx, showIndex)).join('\n\n'));
  return { text: parts.join('\n'), answer, sources };
}

function buildGreeting(): string {
  return [
    '*NewsDash Analyst*',
    '',
    'Ask any news or market question (text or voice). I search NewsDash feeds and reply with a grounded answer plus source links.',
    '',
    'Examples: AI regulation, OpenAI, oil markets, Pakistan crypto, gold price now, weather in Karachi.',
  ].join('\n');
}

function buildWeatherReply(topicLabel: string, weather: WeatherPayload): string {
  if (weather.error) {
    return ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, weather.error].join('\n');
  }
  return [
    '*NewsDash Analyst*',
    '',
    `*Topic:* ${topicLabel}`,
    `Live conditions for ${weather.location}.`,
    '',
    '*Live weather*',
    `*${weather.location}* - ${weather.condition || '-'}`,
    `${weather.temperature ?? '-'} C (feels ${weather.feelsLike ?? '-'} C) | Humidity ${weather.humidity ?? '-'}% | Wind ${weather.windKmh ?? '-'} km/h`,
  ].join('\n');
}

function buildGoldReply(topicLabel: string, gold: GoldQuote): string {
  const lines = [
    '*NewsDash Analyst*',
    '',
    `*Topic:* ${topicLabel}`,
    'Live gold spot (international).',
    '',
    '*Live gold price*',
    `*XAU/USD* - $${gold.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} / oz`,
  ];
  if (gold.pkrPerTolaApprox && gold.usdPkrRate) {
    lines.push(
      `*Approx PKR/tola* - Rs ${gold.pkrPerTolaApprox.toLocaleString('en-PK')} (converted @ ${gold.usdPkrRate.toFixed(2)} PKR/USD)`,
      '_Converted estimate - local jewellery rates may differ._',
    );
  }
  lines.push('_Updated just now_');
  return lines.join('\n');
}

function buildCryptoReply(topicLabel: string, quote: CryptoQuote): string {
  const ch =
    quote.change24h == null
      ? ''
      : ` | 24h ${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%`;
  return [
    '*NewsDash Analyst*',
    '',
    `*Topic:* ${topicLabel}`,
    `Live ${quote.name} price.`,
    '',
    `*Live ${quote.name} price*`,
    `*${quote.symbol}/USD* - $${quote.usd.toLocaleString('en-US', {
      maximumFractionDigits: quote.usd >= 100 ? 2 : 4,
    })}${ch}`,
    '_Updated just now_',
  ].join('\n');
}

function assertQuality(args: {
  kind: PluginKind;
  text: string;
  items?: QueryResultItem[];
  weather?: WeatherPayload | null;
  gold?: GoldQuote | null;
  crypto?: CryptoQuote | null;
  requestedCity?: string;
  answer?: string;
}): { ok: true } | { ok: false; reason: string } {
  const { kind, text, items, weather, gold, crypto, requestedCity, answer } = args;
  if (!text || text.length < 16) return { ok: false, reason: 'Empty reply. Please ask again.' };

  if (kind === 'weather' && !weather?.error) {
    if (weather?.temperature == null || !weather.location) {
      return { ok: false, reason: 'Could not fetch live weather. Please try again.' };
    }
    if (requestedCity) {
      const token = requestedCity.toLowerCase().split(/\s+/)[0];
      if (token.length >= 3 && !(weather.location || '').toLowerCase().includes(token)) {
        return { ok: false, reason: `Could not confirm weather for "${requestedCity}".` };
      }
    }
  }

  if (kind === 'gold_price' && !(gold && gold.price > 0)) {
    return { ok: false, reason: 'Live gold price unavailable. Please try again.' };
  }
  if (kind === 'crypto_price' && !(crypto && crypto.usd > 0)) {
    return { ok: false, reason: 'Live crypto price unavailable. Please try again.' };
  }

  if (kind === 'news' && items?.length) {
    if (!text.includes('*Answer:*')) {
      return { ok: false, reason: 'Could not build a grounded answer. Please ask again.' };
    }
    if (!answer || answer.length < WA_ANSWER_MIN) {
      return { ok: false, reason: 'Could not build a grounded answer. Please ask again.' };
    }
    if (/open the source link for the full publisher article/i.test(answer)) {
      return { ok: false, reason: 'Could not build a grounded answer. Please ask again.' };
    }
    for (const item of items) {
      if (!isValidArticleUrl(item.url) || !text.includes(item.url.trim())) {
        return {
          ok: false,
          reason: 'Could not attach a verifiable NewsDash source link. Please ask again.',
        };
      }
    }
  }

  return { ok: true };
}

function linkPreview(items: QueryResultItem[]): LinkPreview | undefined {
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
  const limit = Math.min(Math.max(body.limit ?? WA_STORY_LIMIT, 1), WA_STORY_LIMIT_MAX);
  const plugin = detectPlugin(q);
  const topicLabel = displayTopic(q, plugin);
  const now = new Date().toISOString();

  if (plugin.kind === 'greeting') {
    return Response.json({
      query: q,
      rawQuery: rawQ,
      displayTopic: topicLabel,
      intent: 'greeting',
      brief: 'Greeting',
      items: [],
      total: 0,
      whatsappText: buildGreeting(),
      lastUpdated: now,
    });
  }

  if (plugin.kind === 'weather') {
    const weather = await fetchWeather(plugin.city, plugin.cityAsked);
    let whatsappText = buildWeatherReply(
      topicLabel,
      weather || { error: 'Could not fetch live weather. Please try again.' },
    );
    const gate = assertQuality({
      kind: 'weather',
      text: whatsappText,
      weather,
      requestedCity: plugin.cityAsked ? plugin.city : undefined,
    });
    if (!gate.ok) {
      whatsappText = ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, gate.reason].join('\n');
    }
    return Response.json({
      query: q,
      rawQuery: rawQ,
      displayTopic: topicLabel,
      intent: 'weather',
      weather: weather ?? undefined,
      brief: weather?.error || `Live conditions for ${weather?.location || topicLabel}.`,
      items: [],
      total: weather && !weather.error ? 1 : 0,
      whatsappText,
      lastUpdated: now,
    });
  }

  if (plugin.kind === 'gold_price') {
    const gold = await fetchGold();
    if (gold) {
      let whatsappText = buildGoldReply(topicLabel, gold);
      const gate = assertQuality({ kind: 'gold_price', text: whatsappText, gold });
      if (!gate.ok) {
        whatsappText = ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, gate.reason].join('\n');
      }
      return Response.json({
        query: q,
        rawQuery: rawQ,
        displayTopic: topicLabel,
        intent: 'gold_price',
        brief: 'Live gold spot (international).',
        items: [],
        total: 1,
        goldPrice: gold,
        whatsappText,
        lastUpdated: now,
      });
    }
    // Fall through to universal news if live quote fails.
  }

  if (plugin.kind === 'crypto_price') {
    const quote = await fetchCrypto(plugin.cryptoId);
    if (quote) {
      let whatsappText = buildCryptoReply(topicLabel, quote);
      const gate = assertQuality({ kind: 'crypto_price', text: whatsappText, crypto: quote });
      if (!gate.ok) {
        whatsappText = ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, gate.reason].join('\n');
      }
      return Response.json({
        query: q,
        rawQuery: rawQ,
        displayTopic: topicLabel,
        intent: 'crypto_price',
        brief: `Live ${quote.name} price.`,
        items: [],
        total: 1,
        cryptoPrice: quote,
        whatsappText,
        lastUpdated: now,
      });
    }
  }

  // ── Universal NewsDash path (default for any question) ──
  const newsQ =
    plugin.kind === 'gold_price'
      ? 'gold'
      : plugin.kind === 'crypto_price'
        ? plugin.cryptoId
        : q;

  // Fuel/pump asks: never invent a number; answer with oil/fuel market evidence from feeds.
  const fuelAsk = /\b(petrol|diesel|gasoline|pump\s*price|fuel\s*price)\b/i.test(q);
  const searchQ = fuelAsk ? `${newsQ} oil crude petroleum fuel` : newsQ;

  const ranked = await retrieveAndRank(
    searchQ,
    limit,
    body.categories && body.categories.length ? body.categories : undefined,
  );

  let items = ranked.items;
  if (fuelAsk) {
    items = items.filter((i) =>
      /\b(oil|crude|brent|wti|petroleum|petrol|diesel|fuel|gasoline|opec)\b/i.test(i.title),
    );
  }

  const note = fuelAsk
    ? 'Live Pakistan pump prices are not wired yet. Showing related oil/fuel coverage from NewsDash.'
    : undefined;

  const built = await buildNewsReply(rawQ, topicLabel, items, ranked.poolSize, note);
  let whatsappText = built.text;
  const gate = assertQuality({
    kind: 'news',
    text: whatsappText,
    items,
    answer: built.answer,
  });
  if (!gate.ok && items.length) {
    whatsappText = ['*NewsDash Analyst*', '', `*Topic:* ${topicLabel}`, gate.reason].join('\n');
  }

  const preview = linkPreview(items);

  return Response.json({
    query: q,
    rawQuery: rawQ,
    displayTopic: topicLabel,
    intent: fuelAsk ? 'unsupported_live' : 'news',
    terms: { primary: ranked.tokens, expanded: ranked.expanded },
    brief: built.answer || note || (items.length ? 'Matching stories from NewsDash.' : 'No strong match.'),
    items,
    total: ranked.total,
    poolSize: ranked.poolSize,
    whatsappText,
    linkPreview: preview,
    linkPreviewEnabled: Boolean(preview),
    lastUpdated: now,
  });
}
