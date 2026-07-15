import { getFeedItemsForQuery } from '@/lib/feeds/fetch-all-feeds';
import { isFresh } from '@/lib/feeds/date-utils';
import { resolveArticleBodies } from '@/lib/feeds/article-body';
import {
  buildExtractiveAnswer,
  buildGroundedAnswer,
  detectQueryLanguage,
  englishSearchHints,
  isWeakGroundedAnswer,
  planNewsQuery,
  resolveReplyLanguage,
  type GroundedSource,
  type ReplyLanguage,
} from '@/lib/query/grounded-answer';
import {
  resolveEffectiveQuery,
  setChatMemory,
} from '@/lib/query/memory';
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
  /** Previous user question in this WhatsApp chat (follow-ups). */
  previousQ?: string;
  /** WhatsApp chat id for short session memory. */
  chatId?: string;
  /** Whisper / client language hint (`ur`, `en`, …). */
  lang?: string;
  replyLang?: 'en' | 'ur';
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
  usdPkrRate?: number;
  pkrApprox?: number;
};

type OilQuote = {
  wtiUsd: number;
  brentUsd?: number;
  wtiChange24h?: number;
  brentChange24h?: number;
  usdPkrRate?: number;
};

type PluginKind = 'greeting' | 'weather' | 'gold_price' | 'crypto_price' | 'fuel_price' | 'news';

type Plugin =
  | { kind: 'greeting' }
  | { kind: 'weather'; city: string; cityAsked: boolean }
  | { kind: 'gold_price' }
  | { kind: 'crypto_price'; cryptoId: string }
  | { kind: 'fuel_price' }
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
  // Roman Urdu grammar/filler — carry no search value against English headlines
  'ki', 'ka', 'ke', 'ko', 'ne', 'se', 'hai', 'hain', 'tha', 'thi', 'the',
  'raha', 'rahi', 'rahe', 'wala', 'wali', 'wale', 'par', 'mein', 'bhi',
  'kya', 'kab', 'kahan', 'kyun', 'kaun', 'kaise', 'kis', 'kisi', 'kuch',
  'aur', 'ya', 'nahi', 'nah', 'hoga', 'hogi', 'ho', 'ab', 'phir', 'sath',
  'chal', 'rha', 'rhi', 'kr', 'kia', 'kar', 'ap', 'aap', 'hum', 'mujhe',
  'mera', 'meri', 'mere', 'uska', 'uski', 'unka', 'unki', 'jo', 'jab', 'jis',
  'batao', 'batain', 'bata', 'do', 'dain', 'hy', 'ha', 'thi', 'tha',
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
  jung: ['war', 'conflict', 'strike', 'attack', 'military', 'invasion'],
  jang: ['war', 'conflict', 'strike', 'attack', 'military'],
  khabar: ['news', 'update', 'report'],
  khabrain: ['news', 'update', 'report'],
  haalat: ['situation', 'update', 'crisis', 'conflict'],
  masla: ['issue', 'conflict', 'crisis', 'problem'],
  maslay: ['issue', 'conflict', 'crisis'],
  hamla: ['attack', 'strike', 'bombing', 'invasion'],
  hamlay: ['attack', 'strike', 'bombing'],
  fauj: ['military', 'army', 'troops', 'forces'],
  fauji: ['military', 'army', 'troops'],
  siyasat: ['politics', 'government', 'policy'],
  hukumat: ['government', 'government', 'administration'],
  ekonomi: ['economy', 'economic', 'market'],
  mehngai: ['inflation', 'prices', 'economy'],
  dollar: ['usd', 'currency', 'exchange', 'pkr'],
  rupee: ['pkr', 'currency', 'exchange'],
  lebanon: ['lebanese', 'hezbollah', 'beirut', 'israel'],
  lebanese: ['lebanon', 'hezbollah', 'beirut'],
  iran: ['iranian', 'tehran', 'strike', 'israel'],
  iranian: ['iran', 'tehran'],
  israel: ['israeli', 'gaza', 'hezbollah', 'iran', 'lebanon'],
  gaza: ['israel', 'palestinian', 'hamas'],
  ukraine: ['ukrainian', 'russia', 'kyiv'],
  russia: ['russian', 'ukraine', 'moscow'],
  // Roman Urdu country/entity names → English equivalents
  america: ['american', 'us', 'usa', 'united states', 'washington'],
  amreeka: ['america', 'american', 'us', 'usa', 'united states'],
  pakistan: ['pakistani', 'islamabad', 'karachi', 'lahore', 'pkr'],
  pakistani: ['pakistan', 'islamabad'],
  china: ['chinese', 'beijing', 'xi jinping'],
  cheena: ['china', 'chinese', 'beijing'],
  india: ['indian', 'new delhi', 'modi', 'bjp'],
  bharat: ['india', 'indian', 'new delhi', 'modi'],
  turkey: ['turkish', 'ankara', 'erdogan'],
  saudi: ['saudi arabia', 'riyadh', 'opec'],
  imran: ['imran khan', 'pti', 'pakistan'],
  nawaz: ['nawaz sharif', 'pmln', 'pakistan'],
};

const ENTITY_BLOCKLIST: Record<string, string[]> = {
  gold: ['goldman', 'golden', 'goldberg', 'goldstein'],
};

const TEASER_RE =
  /\b(the download|round-?up|daily digest|weekly wrap|here'?s what happened|newsletter|hodler'?s digest|state of crypto|things to know|top \d+)\b/i;
const BOILERPLATE_RE =
  /this is today'?s edition|weekday newsletter|daily dose of what'?s going on|subscribe to|photo:/i;

const WA_SUMMARY_MAX = 200;
const WA_STORY_LIMIT = 3;
const WA_STORY_LIMIT_MAX = 3;
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
  // Strip leading politeness
  q = q.replace(/^(please\s+)?(can you|could you|would you)\s+/i, '');
  // Strip intent phrases (greedy — catches "i want to know about", "tell me about", etc.)
  q = q.replace(
    /^(tell me|tell us|give me|show me|get me|i want to know|i need to know|i want|i need|i would like|looking for|explain|describe|find out|check)\s+(about\s+|regarding\s+|on\s+|for\s+|the\s+)?/i,
    '',
  );
  // Catch remaining filler starters
  q = q.replace(/^(to know about|to know|to find out about|to find out|to check|to see)\s+/i, '');
  q = q.replace(/^(what(?:'s| is| are)|whats)\s+(the\s+)?(latest\s+|current\s+|live\s+)?/i, '');
  // "what happened with/to/in X today"
  q = q.replace(
    /^(what\s+)?(happened|happening|going on|news)\s+(with|to|in|about|on|regarding)\s+/i,
    '',
  );
  q = q.replace(/^(any|some)\s+(news|updates?|info|information)\s+(on|about|regarding)\s+/i, '');
  q = q.replace(/\b(today|tonight|right now|currently)\b/gi, ' ');
  q = q.replace(/^(the\s+)?/i, '');
  q = q.replace(/\?+$/g, '').trim();
  q = q.replace(/\s+/g, ' ').trim();
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
  const s = clean(q);
  if (
    /\b(price|prices|spot|rate|rates|cost|how much|worth|trading at|quote|increasing|decreasing|up or down|going up|going down|rose|fell|rally|dump|keemat|qimat|qiymat|kimat|qeemat)\b/.test(
      s,
    )
  ) {
    return true;
  }
  // Urdu script price/rate phrasing (common in voice asks)
  return /قیمت|ریٹ|ریٹس|کتنی|کتنا|کَتنا|کَتنی|ما لیا|مالیت/.test(q);
}

/** Fix common Whisper STT mangling before intent detection. */
function normalizeVoiceQuery(raw: string): string {
  let q = String(raw || '').trim();
  if (!q) return q;

  // Split letters "B T C" / "بی ٹی سی" often heard for BTC
  q = q.replace(/\bb\s*[\.\-]?\s*t\s*[\.\-]?\s*c\b/gi, 'bitcoin');
  q = q.replace(/بی\s*ٹی\s*سی/g, 'bitcoin');
  q = q.replace(/\be\s*[\.\-]?\s*t\s*[\.\-]?\s*h\b/gi, 'ethereum');
  q = q.replace(/\bs\s*[\.\-]?\s*o\s*[\.\-]?\s*l\b/gi, 'solana');

  // Roman Urdu: "bitcoin ki keemat / price batao"
  q = q.replace(/\b(ki|ke|ka)\s+(keemat|qimat|qiymat|kimat|price|rate)\b/gi, ' price ');
  q = q.replace(/\b(keemat|qimat|qiymat|kimat)\b/gi, 'price');
  q = q.replace(/\b(sona|sone|sonay)\b/gi, 'gold');
  q = q.replace(/\b(bit\s*coin|bitkon)\b/gi, 'bitcoin');
  q = q.replace(/\bpatrol\b/gi, 'petrol');
  q = q.replace(/\b(petrol|diesel|fuel)\s*(ki|ke|ka)?\s*(keemat|qimat|qiymat|kimat|price|rate)\b/gi, '$1 price');
  q = q.replace(/پٹرول|پیٹرولیم/g, 'petrol');
  q = q.replace(/ڈیزل/g, 'diesel');

  // Nastaliq: bitcoin/سونا/پیٹرول + قیمت
  if (/قیمت|ریٹ/.test(q)) {
    if (/بٹ\s*کوائن|بٹکوائن|بٹ\s*کون|bitcoin|btc/i.test(q) || /بی\s*ٹی\s*سی/.test(raw)) {
      q = `bitcoin price ${q}`;
    } else if (/سونا|گولڈ|gold/i.test(q)) {
      q = `gold price ${q}`;
    } else if (/ایتھیریم|ethereum|eth/i.test(q)) {
      q = `ethereum price ${q}`;
    } else if (/پیٹرول|پٹرول|ڈیزل|petrol|diesel|fuel/i.test(q)) {
      q = `petrol price ${q}`;
    }
  }

  return q.replace(/\s+/g, ' ').trim();
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
    (/\b(weather|forecast|temperature|humidity|mosam|mosaam|موسم)\b/.test(s) &&
      !/\b(oil|stock|market|bitcoin|crypto|gold|ai|nvidia|news)\b/.test(s))
  ) {
    let city = s
      .replace(
        /\b(weather|forecast|temperature|humidity|mosam|mosaam|today|now|current|please|tell|me|about|of|in|for|the|a|an|to|know|want|need|check|see|find|out|give|show|i|is|what|whats|how|kya|hai)\b/g,
        ' ',
      )
      .replace(/موسم|بتاؤ|بتاو|کیا|ہے/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!city) return { kind: 'weather', city: 'London', cityAsked: false };
    return { kind: 'weather', city: normalizeCityQuery(city), cityAsked: true };
  }

  if (isPriceClarifyQuery(s)) {
    return { kind: 'crypto_price', cryptoId: 'bitcoin' };
  }

  const priceAsk = wantsLivePrice(q) || /\b(increasing|decreasing|up or down)\b/.test(s);
  const mentionsBtc = /\b(bitcoin|btc)\b/.test(s) || /بٹ\s*کوائن|بٹکوائن/.test(q);
  const mentionsEth = /\b(ethereum|eth)\b/.test(s) || /ایتھیریم/.test(q);
  const mentionsSol = /\b(solana|sol)\b/.test(s);
  const mentionsGold = /\b(gold|xau|bullion)\b/.test(s) || /سونا|گولڈ/.test(q);
  const mentionsFuel =
    /\b(petrol|diesel|gasoline|fuel|pump)\b/.test(s) || /پیٹرول|پٹرول|ڈیزل|ایندھن/.test(q);
  const shortAsk = tokenize(s).length <= 5;
  const newsy = /\b(news|headline|regulation|etf|hack|lawsuit|sue|ban|wars?|war)\b/.test(s);

  if (priceAsk) {
    if (mentionsGold) return { kind: 'gold_price' };
    if (mentionsFuel && !newsy) return { kind: 'fuel_price' };
    if (mentionsBtc) return { kind: 'crypto_price', cryptoId: 'bitcoin' };
    if (mentionsEth) return { kind: 'crypto_price', cryptoId: 'ethereum' };
    if (mentionsSol) return { kind: 'crypto_price', cryptoId: 'solana' };
  }

  // Short voice asks like "bitcoin", "btc keemat", "sona", "petrol price" → live quote
  if (shortAsk && !newsy) {
    if (mentionsBtc) return { kind: 'crypto_price', cryptoId: 'bitcoin' };
    if (mentionsEth) return { kind: 'crypto_price', cryptoId: 'ethereum' };
    if (mentionsSol) return { kind: 'crypto_price', cryptoId: 'solana' };
    if (mentionsGold) return { kind: 'gold_price' };
    if (mentionsFuel) return { kind: 'fuel_price' };
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
  if (plugin.kind === 'fuel_price') return 'Petrol / fuel price';
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
  preferFreshHours?: number | null,
): Promise<{
  items: QueryResultItem[];
  total: number;
  poolSize: number;
  tokens: string[];
  expanded: string[];
  usedLatestFallback?: boolean;
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
    // Still serve freshest headlines rather than refusing
    const latest = [...fresh]
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, Math.max(limit * 4, 12))
      .map((i) => ({
        ...i,
        matchScore: 6,
        score: 6 + Math.min(2, i.significance / 5),
        matchedTerms: ['latest'],
      }));
    return {
      items: pickDiverse(latest, limit),
      total: latest.length,
      poolSize: fresh.length,
      tokens,
      expanded,
      usedLatestFallback: latest.length > 0,
    };
  }

  const freshnessBonus = (iso: string): number => {
    if (!preferFreshHours) return 0;
    const ageMs = Date.now() - new Date(iso).getTime();
    const windowMs = preferFreshHours * 60 * 60 * 1000;
    if (Number.isNaN(ageMs) || ageMs < 0) return 0;
    if (ageMs <= windowMs) return 12;
    if (ageMs <= windowMs * 2) return 5;
    return 0;
  };

  // Pass 1: strict title-first ranking
  let scored = fresh
    .map((i) => {
      const { matchScore, score, matchedTerms } = scoreAgainstQuery(i, tokens, expanded, phrase);
      return { ...i, matchScore, score: score + freshnessBonus(i.publishedAt), matchedTerms };
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
        return { ...i, matchScore, score: score + freshnessBonus(i.publishedAt), matchedTerms };
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
          score: matchScore + Math.min(2, i.significance / 5) + freshnessBonus(i.publishedAt),
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
        score: 9 + Math.min(2, i.significance / 5) + freshnessBonus(i.publishedAt),
        matchedTerms: ['tech'],
      }))
      .sort((a, b) => b.score - a.score);
  }

  // Pass 5: never return empty when the feed pool has stories — serve freshest as best available
  let usedLatestFallback = false;
  if (!scored.length && fresh.length) {
    usedLatestFallback = true;
    scored = [...fresh]
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, Math.max(limit * 4, 12))
      .map((i) => ({
        ...i,
        matchScore: 6,
        score: 6 + Math.min(2, i.significance / 5) + freshnessBonus(i.publishedAt),
        matchedTerms: ['latest'],
      }));
  }

  return {
    items: pickDiverse(scored, limit),
    total: scored.length,
    poolSize: fresh.length,
    tokens,
    expanded,
    usedLatestFallback,
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

async function fetchCrypto(id: string, withPkr = false): Promise<CryptoQuote | null> {
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
    const quote: CryptoQuote = {
      id,
      symbol: meta.symbol,
      name: meta.name,
      usd,
      change24h: Number.isFinite(Number(row?.usd_24h_change))
        ? Number(row.usd_24h_change)
        : undefined,
    };
    if (withPkr) {
      const usdPkr = await fetchUsdPkr();
      if (usdPkr) {
        quote.usdPkrRate = usdPkr;
        quote.pkrApprox = Math.round(usd * usdPkr);
      }
    }
    return quote;
  } catch {
    return null;
  }
}

async function fetchYahooOil(symbol: string): Promise<{
  price: number;
  change24h?: number;
} | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      '?interval=1d&range=2d';
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'NewsDash/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    const change24h =
      Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : undefined;
    return { price, change24h };
  } catch {
    return null;
  }
}

async function fetchOil(): Promise<OilQuote | null> {
  try {
    const [wti, brent, usdPkr] = await Promise.all([
      fetchYahooOil('CL=F'),
      fetchYahooOil('BZ=F'),
      fetchUsdPkr(),
    ]);
    if (!wti) return null;
    const quote: OilQuote = {
      wtiUsd: wti.price,
      wtiChange24h: wti.change24h,
      brentUsd: brent?.price,
      brentChange24h: brent?.change24h,
    };
    if (usdPkr) quote.usdPkrRate = usdPkr;
    return quote;
  } catch {
    return null;
  }
}

function isFuelStory(item: Pick<NewsItem, 'title' | 'description'>): boolean {
  const hay = `${item.title} ${item.description || ''}`.toLowerCase();
  return /\b(oil|crude|brent|wti|petroleum|petrol|diesel|fuel|gasoline|opec|barrel|gas\s+price)\b/i.test(
    hay,
  );
}

function localizedTopicLabel(label: string, lang: ReplyLanguage): string {
  if (lang !== 'ur') return label;
  const map: Record<string, string> = {
    'Gold price': 'سونے کی قیمت',
    'Bitcoin price': 'بٹ کوائن کی قیمت',
    'Ethereum price': 'ایتھیریم کی قیمت',
    'Solana price': 'سولانا کی قیمت',
    'Petrol / fuel price': 'پیٹرول / ایندھن کی قیمت',
    'Crypto price': 'کرپٹو کی قیمت',
  };
  return map[label] || label;
}

const SHORT_LINK_TIMEOUT_MS = 2500;
const PUBLIC_APP = 'https://news-d.vercel.app';

function makeBrandedRedirect(url: string): string {
  const b64 = Buffer.from(url.trim(), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${PUBLIC_APP}/api/r/${b64}`;
}

/**
 * Shorten publisher URLs for WhatsApp (messy long links → short tappable https).
 * Prefer public shorteners; fall back to branded /api/r when shorter than original.
 */
async function shortenArticleUrl(url: string): Promise<string> {
  const original = url.trim();
  if (!isValidArticleUrl(original)) return original;

  const endpoints = [
    'https://is.gd/create.php?format=simple&url=' + encodeURIComponent(original),
    'https://v.gd/create.php?format=simple&url=' + encodeURIComponent(original),
    'https://tinyurl.com/api-create.php?url=' + encodeURIComponent(original),
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SHORT_LINK_TIMEOUT_MS);
      try {
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: { Accept: 'text/plain' },
        });
        if (!res.ok) continue;
        const short = (await res.text()).trim();
        if (/^https?:\/\/(is\.gd|v\.gd|tinyurl\.com)\/[A-Za-z0-9_-]+$/i.test(short)) {
          return short;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // try next shortener
    }
  }

  const branded = makeBrandedRedirect(original);
  return branded.length < original.length ? branded : original;
}

/**
 * Formats a source for WhatsApp with a short clickable https URL.
 * WhatsApp auto-linkifies https:// so users can open the real article.
 */
function formatSourceLine(
  i: QueryResultItem,
  idx: number,
  showIndex: boolean,
  displayUrl: string,
): string {
  const when = formatTime(i.publishedAt);
  const label = (i.source || 'Publisher').replace(/[\[\]]/g, '').trim() || 'Publisher';
  const prefix = showIndex ? `*${idx + 1}. ${i.title.trim()}*` : `*${i.title.trim()}*`;
  const meta = [label, when].filter(Boolean).join(' · ');
  return [`${prefix}${meta ? ` — ${meta}` : ''}`, displayUrl].join('\n');
}

type SourceButton = { type: 'url'; text: string; url: string };

function buttonLabel(source: string, idx: number, total: number): string {
  const base = (source || 'Open article').replace(/[\[\]*]/g, '').trim() || 'Open article';
  let label = total > 1 ? `${idx + 1}. ${base}` : base;
  if (label.length > 20) label = label.slice(0, 17) + '...';
  return label;
}

function buildSourceButtons(items: QueryResultItem[], displayUrls: string[]): SourceButton[] {
  return items
    .filter((i) => isValidArticleUrl(i.url))
    .slice(0, 3)
    .map((i, idx, arr) => ({
      type: 'url' as const,
      text: buttonLabel(i.source || 'Open article', idx, arr.length),
      url: displayUrls[idx] || i.url.trim(),
    }));
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
  closestCoverage?: boolean,
  langOverride?: ReplyLanguage,
): Promise<{
  text: string;
  answer: string;
  sources: GroundedSource[];
  sourceButtons: SourceButton[];
  displayUrls: string[];
}> {
  const lang = langOverride ?? detectQueryLanguage(question);
  const topicHdr = localizedTopicLabel(topicLabel, lang);
  const topicKey = lang === 'ur' ? '*موضوع:*' : '*Topic:*';
  const parts = ['*NewsDash Analyst*', '', `${topicKey} ${topicHdr}`];
  if (note) parts.push(note);
  else if (closestCoverage && items.length) {
    parts.push(
      lang === 'ur'
        ? '_قریب ترین تازہ کوریج:_'
        : '_Closest live coverage from NewsDash:_',
    );
  }

  if (!items.length) {
    // Only when the whole feed pool is empty (syncing). Never claim the topic was "not published".
    const syncing =
      lang === 'ur'
        ? 'NewsDash کی فیڈز ابھی تازہ ہو رہی ہیں۔ ایک لمحے بعد دوبارہ پوچھیں — میں تازہ کوریج سے جواب دوں گا۔'
        : 'NewsDash feeds are refreshing. Ask again in a moment and I will answer from the latest coverage.';
    parts.push(syncing);
    return { text: parts.join('\n'), answer: '', sources: [], sourceButtons: [], displayUrls: [] };
  }

  const sources = await enrichGroundedSources(items);
  let answer = await buildGroundedAnswer(question, sources, lang);
  // Strip leading refusal sentences the model sometimes still emits
  if (answer) {
    answer = answer
      .replace(
        /^(there is no[^.]*\.\s*|no news on[^.]*\.\s*|ن.*معلومات[^.]*[.۔]\s*)/i,
        '',
      )
      .trim();
  }
  const weak = Boolean(!answer || isWeakGroundedAnswer(answer));
  if (!answer || answer.length < WA_ANSWER_MIN || weak) {
    answer = buildExtractiveAnswer(question, sources, lang);
  }

  const displayUrls = await Promise.all(items.map((i) => shortenArticleUrl(i.url)));
  const sourceButtons = buildSourceButtons(items, displayUrls);
  const answerLabel = lang === 'ur' ? '*جواب:*' : '*Answer:*';
  const sourcesLabel = lang === 'ur' ? '*ذرائع:*' : '*Sources*';
  parts.push('', answerLabel, answer, '', sourcesLabel);
  const showIndex = items.length > 1;
  parts.push(
    items.map((i, idx) => formatSourceLine(i, idx, showIndex, displayUrls[idx])).join('\n\n'),
  );
  return { text: parts.join('\n'), answer, sources, sourceButtons, displayUrls };
}

function buildGreeting(lang: ReplyLanguage): string {
  if (lang === 'ur') {
    return [
      '*NewsDash Analyst*',
      '',
      'انگریزی یا اردو میں (ٹیکسٹ یا آواز) سوال کریں۔ میں NewsDash کی تازہ خبریں تلاش کر کے مختصر جواب اور ذرائع کے لنک بھیجتا ہوں۔',
      '',
      'مثالیں:',
      '• gold price now / سونے کی قیمت',
      '• bitcoin price / بٹ کوائن',
      '• weather in Karachi / کراچی کا موسم',
      '• AI regulation / OpenAI / oil markets',
    ].join('\n');
  }
  return [
    '*NewsDash Analyst*',
    '',
    'Ask in English or Urdu (text or voice). I search live NewsDash feeds and reply with a short clear answer plus source links.',
    '',
    'Try:',
    '• gold price now',
    '• bitcoin price',
    '• weather in Karachi',
    '• AI regulation / OpenAI / oil markets',
  ].join('\n');
}

function buildWeatherReply(topicLabel: string, weather: WeatherPayload, lang: ReplyLanguage): string {
  const topicKey = lang === 'ur' ? '*موضوع:*' : '*Topic:*';
  const topicHdr = localizedTopicLabel(topicLabel, lang);
  if (weather.error) {
    const err =
      lang === 'ur'
        ? 'موسم کی معلومات ابھی دستیاب نہیں۔'
        : weather.error;
    return ['*NewsDash Analyst*', '', `${topicKey} ${topicHdr}`, err].join('\n');
  }
  const liveHdr = lang === 'ur' ? '*لائیو موسم*' : '*Live weather*';
  const condLine =
    lang === 'ur'
      ? `*${weather.location}* — ${weather.condition || '-'}`
      : `*${weather.location}* - ${weather.condition || '-'}`;
  const statsLine =
    lang === 'ur'
      ? `${weather.temperature ?? '-'}°C (محسوس ${weather.feelsLike ?? '-'}°C) | نمی ${weather.humidity ?? '-'}% | ہوا ${weather.windKmh ?? '-'} کلومیٹر/گھنٹہ`
      : `${weather.temperature ?? '-'} C (feels ${weather.feelsLike ?? '-'} C) | Humidity ${weather.humidity ?? '-'}% | Wind ${weather.windKmh ?? '-'} km/h`;
  const intro =
    lang === 'ur'
      ? `${weather.location} کے لیے تازہ موسم۔`
      : `Live conditions for ${weather.location}.`;
  return [
    '*NewsDash Analyst*',
    '',
    `${topicKey} ${topicHdr}`,
    intro,
    '',
    liveHdr,
    condLine,
    statsLine,
  ].join('\n');
}

function buildGoldReply(topicLabel: string, gold: GoldQuote, lang: ReplyLanguage): string {
  const topicKey = lang === 'ur' ? '*موضوع:*' : '*Topic:*';
  const topicHdr = localizedTopicLabel(topicLabel, lang);
  const liveHdr = lang === 'ur' ? '*لائیو سونے کی قیمت*' : '*Live gold price*';
  const lines = [
    '*NewsDash Analyst*',
    '',
    `${topicKey} ${topicHdr}`,
    lang === 'ur' ? 'بین الاقوامی سونے کی اسپاٹ قیمت۔' : 'Live gold spot (international).',
    '',
    liveHdr,
    `*XAU/USD* - $${gold.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} / oz`,
  ];
  if (gold.pkrPerTolaApprox && gold.usdPkrRate) {
    lines.push(
      lang === 'ur'
        ? `*تخمینہ PKR/تولہ* — Rs ${gold.pkrPerTolaApprox.toLocaleString('en-PK')} (@ ${gold.usdPkrRate.toFixed(2)} PKR/USD)`
        : `*Approx PKR/tola* - Rs ${gold.pkrPerTolaApprox.toLocaleString('en-PK')} (converted @ ${gold.usdPkrRate.toFixed(2)} PKR/USD)`,
      lang === 'ur'
        ? '_تخمینہ — مقامی زیورات کی قیمتیں مختلف ہو سکتی ہیں۔_'
        : '_Converted estimate - local jewellery rates may differ._',
    );
  }
  lines.push(lang === 'ur' ? '_ابھی اپ ڈیٹ_' : '_Updated just now_');
  return lines.join('\n');
}

function buildCryptoReply(topicLabel: string, quote: CryptoQuote, lang: ReplyLanguage): string {
  const topicKey = lang === 'ur' ? '*موضوع:*' : '*Topic:*';
  const topicHdr = localizedTopicLabel(topicLabel, lang);
  const ch =
    quote.change24h == null
      ? ''
      : ` | 24h ${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%`;
  const liveHdr =
    lang === 'ur'
      ? `*لائیو ${localizedTopicLabel(topicLabel, 'ur')}*`
      : `*Live ${quote.name} price*`;
  const lines = [
    '*NewsDash Analyst*',
    '',
    `${topicKey} ${topicHdr}`,
    lang === 'ur' ? `لائیو ${quote.name} قیمت۔` : `Live ${quote.name} price.`,
    '',
    liveHdr,
    `*${quote.symbol}/USD* - $${quote.usd.toLocaleString('en-US', {
      maximumFractionDigits: quote.usd >= 100 ? 2 : 4,
    })}${ch}`,
  ];
  if (quote.pkrApprox && quote.usdPkrRate) {
    lines.push(
      lang === 'ur'
        ? `*تخمینہ PKR* — Rs ${quote.pkrApprox.toLocaleString('en-PK')} (@ ${quote.usdPkrRate.toFixed(2)} PKR/USD)`
        : `*Approx PKR* - Rs ${quote.pkrApprox.toLocaleString('en-PK')} (@ ${quote.usdPkrRate.toFixed(2)} PKR/USD)`,
    );
  }
  lines.push(lang === 'ur' ? '_ابھی اپ ڈیٹ_' : '_Updated just now_');
  return lines.join('\n');
}

function buildFuelReply(topicLabel: string, oil: OilQuote, lang: ReplyLanguage): string {
  const topicKey = lang === 'ur' ? '*موضوع:*' : '*Topic:*';
  const topicHdr = localizedTopicLabel(topicLabel, lang);
  const fmtCh = (n?: number) =>
    n == null ? '' : ` | 24h ${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const liveHdr = lang === 'ur' ? '*لائیو کرڈ آئل (بین الاقوامی)*' : '*Live crude oil (international)*';
  const lines = [
    '*NewsDash Analyst*',
    '',
    `${topicKey} ${topicHdr}`,
    '',
    liveHdr,
    `*WTI* - $${oil.wtiUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} / barrel${fmtCh(oil.wtiChange24h)}`,
  ];
  if (oil.brentUsd) {
    lines.push(
      `*Brent* - $${oil.brentUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} / barrel${fmtCh(oil.brentChange24h)}`,
    );
  }
  if (oil.usdPkrRate) {
    const wtiPkr = Math.round(oil.wtiUsd * oil.usdPkrRate);
    lines.push(
      lang === 'ur'
        ? `*WTI تخمینہ PKR* — Rs ${wtiPkr.toLocaleString('en-PK')} فی بیرل (@ ${oil.usdPkrRate.toFixed(2)} PKR/USD)`
        : `*WTI approx PKR* - Rs ${wtiPkr.toLocaleString('en-PK')} / barrel (@ ${oil.usdPkrRate.toFixed(2)} PKR/USD)`,
    );
  }
  lines.push(
    lang === 'ur'
      ? '_نوٹ: پاکستان کے پمپ ریٹ OGRA سے الگ ہوتے ہیں؛ یہ بین الاقوامی تیل کی قیمت ہے۔_'
      : '_Note: Pakistan pump rates are set by OGRA and differ from international crude._',
    lang === 'ur' ? '_ابھی اپ ڈیٹ_' : '_Updated just now_',
  );
  return lines.join('\n');
}

function assertQuality(args: {
  kind: PluginKind;
  text: string;
  items?: QueryResultItem[];
  weather?: WeatherPayload | null;
  gold?: GoldQuote | null;
  crypto?: CryptoQuote | null;
  oil?: OilQuote | null;
  requestedCity?: string;
  answer?: string;
  sourceButtons?: SourceButton[];
  displayUrls?: string[];
}): { ok: true } | { ok: false; reason: string } {
  const { kind, text, items, weather, gold, crypto, oil, requestedCity, answer, displayUrls } = args;
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
  if (kind === 'fuel_price' && !(oil && oil.wtiUsd > 0)) {
    return { ok: false, reason: 'Live oil price unavailable. Please try again.' };
  }

  if (kind === 'news' && items?.length) {
    if (!text.includes('*Answer:*') && !text.includes('*جواب:*')) {
      return { ok: false, reason: 'Could not build a grounded answer.' };
    }
    if (!answer || answer.length < WA_ANSWER_MIN) {
      return { ok: false, reason: 'Could not build a grounded answer.' };
    }
    if (/open the source link for the full publisher article/i.test(answer)) {
      return { ok: false, reason: 'Could not build a grounded answer.' };
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!isValidArticleUrl(item.url)) {
        return { ok: false, reason: 'Could not attach a verifiable source link.' };
      }
      const shown = (displayUrls && displayUrls[i]) || item.url.trim();
      if (!text.includes(shown) && !text.includes(item.url.trim())) {
        return { ok: false, reason: 'Could not attach a verifiable source link.' };
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
  if (!body || typeof body.q !== 'string' || body.q.trim().length < 1) {
    return Response.json({ error: 'Provide a query string `q`.' }, { status: 400 });
  }

  const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
  const incomingQ = body.q.trim();
  const replyLangEarly = detectQueryLanguage(incomingQ);
  const resolved = await resolveEffectiveQuery({
    rawQ: incomingQ,
    previousQ: typeof body.previousQ === 'string' ? body.previousQ : null,
    chatId,
    lang: replyLangEarly,
  });

  if (resolved.needsClarify && resolved.clarifyText) {
    return Response.json({
      query: incomingQ,
      rawQuery: incomingQ,
      displayTopic: 'Clarify',
      intent: 'clarify',
      brief: 'Need a clearer question',
      items: [],
      total: 0,
      whatsappText: resolved.clarifyText,
      usedMemory: false,
      lastUpdated: new Date().toISOString(),
    });
  }

  const rawQ = normalizeVoiceQuery(resolved.effectiveQ.trim());
  if (rawQ.length < 2) {
    return Response.json({ error: 'Provide a query string `q`.' }, { status: 400 });
  }
  const replyLang = resolveReplyLanguage(
    incomingQ,
    rawQ,
    body.replyLang || body.lang,
  );
  const q = extractTopicQuery(rawQ);
  const limit = Math.min(Math.max(body.limit ?? WA_STORY_LIMIT, 1), WA_STORY_LIMIT_MAX);
  const plugin = detectPlugin(q);
  const topicLabel = displayTopic(q, plugin);
  const now = new Date().toISOString();
  const remember = (topic: string) => {
    // Remember the user-facing topic, not internal clarifiers.
    if (plugin.kind === 'greeting') return;
    setChatMemory(chatId, rawQ, topic);
  };

  if (plugin.kind === 'greeting') {
    return Response.json({
      query: q,
      rawQuery: incomingQ,
      displayTopic: topicLabel,
      intent: 'greeting',
      brief: 'Greeting',
      items: [],
      total: 0,
      whatsappText: buildGreeting(replyLang),
      usedMemory: resolved.usedMemory,
      lastUpdated: now,
    });
  }

  if (plugin.kind === 'weather') {
    const weather = await fetchWeather(plugin.city, plugin.cityAsked);
    let whatsappText = buildWeatherReply(
      topicLabel,
      weather || { error: 'Could not fetch live weather.' },
      replyLang,
    );
    const gate = assertQuality({
      kind: 'weather',
      text: whatsappText,
      weather,
      requestedCity: plugin.cityAsked ? plugin.city : undefined,
    });
    if (!gate.ok) {
      const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
      whatsappText =
        replyLang === 'ur'
          ? [
              '*NewsDash Analyst*',
              '',
              `${topicKey} ${localizedTopicLabel(topicLabel, replyLang)}`,
              `*${plugin.city}* کے لیے موسم ابھی دستیاب نہیں۔`,
              '',
              'براہِ کرم:',
              '• واضح شہر لکھیں (مثلاً "Karachi weather")',
              '• چند منٹ بعد دوبارہ کوشش کریں',
            ].join('\n')
          : [
              '*NewsDash Analyst*',
              '',
              `${topicKey} ${topicLabel}`,
              `Live weather for *${plugin.city}* is not available right now.`,
              '',
              'Please try:',
              '• A more specific city name (e.g. "Karachi weather", "Lahore weather")',
              '• Checking again in a few minutes',
            ].join('\n');
    }
    remember(topicLabel);
    return Response.json({
      query: q,
      rawQuery: incomingQ,
      displayTopic: topicLabel,
      intent: 'weather',
      weather: weather ?? undefined,
      brief: weather?.error || `Live conditions for ${weather?.location || topicLabel}.`,
      items: [],
      total: weather && !weather.error ? 1 : 0,
      whatsappText,
      usedMemory: resolved.usedMemory,
      lastUpdated: now,
    });
  }

  if (plugin.kind === 'gold_price') {
    const gold = await fetchGold();
    if (gold) {
      let whatsappText = buildGoldReply(topicLabel, gold, replyLang);
      const gate = assertQuality({ kind: 'gold_price', text: whatsappText, gold });
      if (!gate.ok) {
        const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
        whatsappText = ['*NewsDash Analyst*', '', `${topicKey} ${localizedTopicLabel(topicLabel, replyLang)}`, gate.reason].join('\n');
      }
      remember(topicLabel);
      return Response.json({
        query: q,
        rawQuery: incomingQ,
        displayTopic: topicLabel,
        intent: 'gold_price',
        brief: 'Live gold spot (international).',
        items: [],
        total: 1,
        goldPrice: gold,
        whatsappText,
        usedMemory: resolved.usedMemory,
        lastUpdated: now,
      });
    }
    // Fall through to universal news if live quote fails.
  }

  if (plugin.kind === 'crypto_price') {
    const quote = await fetchCrypto(plugin.cryptoId, replyLang === 'ur');
    if (quote) {
      let whatsappText = buildCryptoReply(topicLabel, quote, replyLang);
      const gate = assertQuality({ kind: 'crypto_price', text: whatsappText, crypto: quote });
      if (!gate.ok) {
        const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
        whatsappText = ['*NewsDash Analyst*', '', `${topicKey} ${localizedTopicLabel(topicLabel, replyLang)}`, gate.reason].join('\n');
      }
      remember(topicLabel);
      return Response.json({
        query: q,
        rawQuery: incomingQ,
        displayTopic: topicLabel,
        intent: 'crypto_price',
        brief: `Live ${quote.name} price.`,
        items: [],
        total: 1,
        cryptoPrice: quote,
        whatsappText,
        usedMemory: resolved.usedMemory,
        lastUpdated: now,
      });
    }
  }

  if (plugin.kind === 'fuel_price') {
    const oil = await fetchOil();
    if (oil) {
      let whatsappText = buildFuelReply(topicLabel, oil, replyLang);
      const gate = assertQuality({ kind: 'fuel_price', text: whatsappText, oil });
      if (!gate.ok) {
        const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
        whatsappText = ['*NewsDash Analyst*', '', `${topicKey} ${localizedTopicLabel(topicLabel, replyLang)}`, gate.reason].join('\n');
      }
      remember(topicLabel);
      return Response.json({
        query: q,
        rawQuery: incomingQ,
        displayTopic: topicLabel,
        intent: 'fuel_price',
        brief: 'Live crude oil (WTI/Brent).',
        items: [],
        total: 1,
        oilPrice: oil,
        whatsappText,
        usedMemory: resolved.usedMemory,
        lastUpdated: now,
      });
    }
    // Fall through to oil-news path if live quote fails.
  }

  // ── Universal NewsDash path (default for any question) ──
  const newsQ =
    plugin.kind === 'gold_price'
      ? 'gold'
      : plugin.kind === 'crypto_price'
        ? plugin.cryptoId
        : plugin.kind === 'fuel_price'
          ? 'oil crude petroleum fuel opec'
          : q;

  // Fuel/pump asks: never invent a pump number; answer with oil/fuel market evidence.
  const fuelAsk =
    /\b(petrol|diesel|gasoline|pump\s*price|fuel\s*price)\b/i.test(q) ||
    /پیٹرول|ڈیزل|پیٹرولیم/.test(rawQ);

  // Smart rewrite: better keywords + topic label than raw tokenize.
  const plan = plugin.kind === 'news' ? await planNewsQuery(rawQ) : null;
  const urduHints = await englishSearchHints(rawQ, replyLang);
  let baseSearch = plan?.searchQuery || urduHints || newsQ;
  if (fuelAsk) {
    // Prefer oil market headlines over literal "pakistan petrol" which often match nothing.
    baseSearch = `${plan?.searchQuery || 'oil crude petroleum fuel gasoline'} oil crude petroleum fuel opec diesel`;
  }

  const preferFresh =
    plan?.preferFreshHours ??
    (/\b(today|latest|now|breaking|just\s+in|aaj)\b/i.test(rawQ) ? 24 : null);

  const newsTopicLabel =
    plugin.kind === 'news' && plan?.displayTopic
      ? plan.displayTopic
      : topicLabel;

  const ranked = await retrieveAndRank(
    baseSearch,
    limit,
    body.categories && body.categories.length ? body.categories : undefined,
    preferFresh,
  );

  let items = ranked.items;
  if (fuelAsk || plugin.kind === 'fuel_price') {
    let fuelish = items.filter(isFuelStory);
    if (!fuelish.length) {
      const retry = await retrieveAndRank(
        'crude oil brent wti opec petroleum fuel diesel gasoline prices',
        limit,
        body.categories && body.categories.length ? body.categories : undefined,
        preferFresh,
      );
      fuelish = retry.items.filter(isFuelStory);
      if (fuelish.length) {
        items = fuelish;
        ranked.total = retry.total;
        ranked.poolSize = retry.poolSize;
      } else if (retry.items.length) {
        items = retry.items.filter(isFuelStory);
      }
    } else {
      items = fuelish;
    }
  }

  const note = fuelAsk
    ? replyLang === 'ur'
      ? 'نوٹ: پاکستان کے لائیو پمپ ریٹ ابھی منسلک نہیں۔ تیل/ایندھن کی متعلقہ کوریج دے رہا ہوں۔'
      : 'Note: live Pakistan pump rates are not connected yet. Sharing related oil/fuel coverage.'
    : undefined;

  const built = await buildNewsReply(
    rawQ,
    newsTopicLabel,
    items,
    ranked.poolSize,
    note,
    Boolean(ranked.usedLatestFallback),
    replyLang,
  );
  let whatsappText = built.text;
  let sourceButtons = built.sourceButtons;
  let displayUrls = built.displayUrls;
  const gate = assertQuality({
    kind: 'news',
    text: whatsappText,
    items,
    answer: built.answer,
    sourceButtons,
    displayUrls,
  });
  if (!gate.ok && items.length) {
    displayUrls = await Promise.all(items.map((i) => shortenArticleUrl(i.url)));
    sourceButtons = buildSourceButtons(items, displayUrls);
    const fallbackAnswer = buildExtractiveAnswer(
      rawQ,
      items.map((i) => ({
        title: i.title,
        source: i.source || 'Publisher',
        url: i.url,
        publishedAt: i.publishedAt,
        body: i.description || i.title,
      })),
      replyLang,
    );
    const aLabel = replyLang === 'ur' ? '*جواب:*' : '*Answer:*';
    const sLabel = replyLang === 'ur' ? '*ذرائع:*' : '*Sources*';
    const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
    whatsappText = [
      '*NewsDash Analyst*',
      '',
      `${topicKey} ${localizedTopicLabel(newsTopicLabel, replyLang)}`,
      '',
      aLabel,
      fallbackAnswer,
      '',
      sLabel,
      items
        .map((i, idx) => formatSourceLine(i, idx, items.length > 1, displayUrls[idx]))
        .join('\n\n'),
    ].join('\n');
  }

  const preview = linkPreview(items);

  remember(newsTopicLabel);
  return Response.json({
    query: q,
    rawQuery: incomingQ,
    effectiveQuery: rawQ,
    displayTopic: newsTopicLabel,
    intent: fuelAsk ? 'unsupported_live' : 'news',
    terms: { primary: ranked.tokens, expanded: ranked.expanded },
    brief: built.answer || note || (items.length ? 'Matching stories from NewsDash.' : 'No strong match.'),
    items,
    total: ranked.total,
    poolSize: ranked.poolSize,
    whatsappText,
    sourceButtons,
    linkPreview: preview,
    linkPreviewEnabled: true,
    usedMemory: resolved.usedMemory,
    lastUpdated: now,
  });
}
