import { getFeedItemsForQuery } from '@/lib/feeds/fetch-all-feeds';
import { isFresh } from '@/lib/feeds/date-utils';
import { resolveArticleBodies } from '@/lib/feeds/article-body';
import {
  buildConversationalReply,
  buildExtractiveAnswer,
  buildGroundedAnswer,
  buildGroundedAnswerWithPath,
  detectQueryLanguage,
  englishSearchHints,
  isDegenerateRepetition,
  isWeakGroundedAnswer,
  mapClaimsToSources,
  planNewsQuery,
  resolveReplyLanguage,
  selectRelevantCandidateIndexes,
  translateAnswerText,
  type GroundedSource,
  type ReplyLanguage,
} from '@/lib/query/grounded-answer';
import {
  getConversationStateForChat,
  isVagueFollowUp,
  normalizeChatId,
  resolveEffectiveQuery,
  setChatMemory,
  stableAsk,
  type HistoryTurn,
  type StoredSource,
} from '@/lib/query/memory';
import { classifyTurn, type TurnClassification } from '@/lib/query/classify-turn';
import {
  awaitingWeatherCitySlot,
  extractWeatherCitiesFromAsk,
  looksLikeCitySlotFill,
  normalizeCityQuery,
  requestedPumpProducts,
  splitWeatherCities,
  stripWeatherFillers,
  wantsPakistanPumpFuel,
  WEATHER_NON_CITY,
} from '@/lib/query/plugin-gates';
import {
  buildDawnOpinionListReply,
  buildDawnOpinionPickBrief,
  buildDawnOpinionPickClarify,
  DAWN_OPINION_LIST_INTENT,
  dawnItemsToStoredSources,
  dawnMenuSourcesFromState,
  fetchDawnOpinionItems,
  isDawnOpinionListAsk,
  isDawnOpinionMenuPending,
  looksLikeDawnPickAttempt,
  parseDawnOpinionSelection,
  type DawnOpinionItem,
} from '@/lib/query/dawn-opinion';
import { isIdentityAsk } from '@/lib/query/persona';
import {
  beginTurnPaths,
  getTurnPaths,
  logTurnPaths,
  setClassifyPath,
  setGroundingPath,
  type TurnPathLog,
} from '@/lib/query/turn-paths';
import { createStageTimer, newRequestId } from '@/lib/rag/metrics';
import { inferNeedTag } from '@/lib/rag/chunk';
import { fuseHybridAndLexical, hybridRetrieve } from '@/lib/rag/retrieve';
import type { RagNeedTag } from '@/lib/rag/types';
import { isVectorConfigured } from '@/lib/rag/vector';
import type { Category, NewsItem } from '@/types';
import { getRedisClient } from '@/lib/kv/redis';
import {
  expandTopicTokens,
  isAbstractTopicAsk,
  questionLooksAbstract,
} from '@/lib/query/topic-expand';


export const dynamic = 'force-dynamic';

/** Active request id for path instrumentation inside nested helpers. */
let currentRequestId = '';

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
  /** Recent chat turns from n8n (user/assistant). */
  history?: HistoryTurn[];
  /** Last known intent from session (gold_price, fuel_price, …). */
  previousIntent?: string;
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
  wtiPkrApprox?: number;
  brentPkrApprox?: number;
};

/** Pakistan pump / ex-depot prices (PKR per litre) — not WTI/Brent barrels. */
type PakistanFuelQuote = {
  petrolPkr: number;
  dieselPkr: number;
  effectiveDate?: string;
  source: string;
  scrapedAt?: string;
  /** Publisher pages the user can open to verify (full https URLs). */
  verifyUrls: Array<{ label: string; url: string }>;
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
  ml: ['machine learning', 'ai', 'model'],
  llm: ['large language model', 'ai', 'gpt', 'claude', 'gemini'],
  gpt: ['openai', 'ai', 'chatgpt'],
  // GitHub / open-source
  repo: ['repository', 'github', 'open source'],
  repos: ['repository', 'repositories', 'github'],
  trending: ['popular', 'top', 'github', 'repository'],
  opensource: ['open source', 'github', 'repository'],
  devops: ['docker', 'kubernetes', 'ci/cd', 'cloud', 'deployment'],
  docker: ['container', 'devops', 'kubernetes'],
  kubernetes: ['k8s', 'container', 'devops', 'cloud'],
  // AI / LLM releases
  gpt5: ['openai', 'gpt', 'ai model'],
  claude: ['anthropic', 'ai', 'llm'],
  gemini: ['google', 'ai', 'llm'],
  llama: ['meta', 'open source', 'llm', 'ai'],
  mistral: ['llm', 'ai', 'open source'],
  // Framework / dev tools
  nextjs: ['next.js', 'react', 'javascript', 'framework'],
  react: ['javascript', 'framework', 'frontend'],
  typescript: ['javascript', 'programming', 'developer'],
  rust: ['programming', 'language', 'system'],
  nodejs: ['node', 'javascript', 'backend'],
  python: ['programming', 'language', 'developer'],
  // Layoffs / jobs
  layoffs: ['fired', 'job cuts', 'redundancy', 'tech layoffs', 'downsizing'],
  layoff: ['fired', 'job cuts', 'tech layoffs'],
  hiring: ['jobs', 'recruitment', 'engineering jobs'],
  // Cybersecurity / CVE
  cve: ['vulnerability', 'security', 'exploit', 'patch'],
  vulnerability: ['cve', 'exploit', 'security', 'breach'],
  breach: ['hack', 'security', 'data leak', 'cyberattack'],
  hack: ['breach', 'security', 'cyberattack', 'exploit'],
  ransomware: ['malware', 'security', 'cyberattack', 'breach'],
  malware: ['virus', 'security', 'exploit', 'ransomware'],
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
  macro: ['macroeconomic', 'inflation', 'gdp', 'trade', 'tariff', 'fed', 'rates', 'markets'],
  macroeconomic: ['macro', 'inflation', 'gdp', 'trade', 'tariff', 'fed', 'rates', 'recession', 'markets'],
  macroeconomics: ['macro', 'macroeconomic', 'inflation', 'gdp', 'trade', 'tariff', 'fed', 'rates'],
  economy: ['economic', 'inflation', 'gdp', 'recession', 'growth', 'markets', 'trade'],
  economic: ['economy', 'inflation', 'gdp', 'recession', 'growth', 'markets', 'trade'],
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
/** Rotates no-match boilerplate so consecutive empty retrievals don't clone one sentence. */
let noMatchVariantSeq = 0;

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
  // Concept expansions (macro → inflation/tariff/…) for recall only.
  for (const x of expandTopicTokens(tokens)) out.add(x);
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
    /\b(price|prices|spot|rate|rates|cost|how much|worth|trading at|quote|increasing|decreasing|increase|decrease|up or down|going up|going down|rose|fell|rally|dump|keemat|qimat|qiymat|kimat|qeemat|praiz|prize)\b/.test(
      s,
    )
  ) {
    return true;
  }
  // Urdu script price/rate / increase-decrease phrasing (common in voice asks)
  return /قیمت|ریٹ|ریٹس|پرائز|پرائیس|انکریز|ڈیکریز|کتنی|کتنا|کَتنا|کَتنی|بڑھی|کم\s*ہو|زیادہ\s*ہو|ما لیا|مالیت/.test(
    q,
  );
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
  q = q.replace(/\b(praiz|prize|pricc)\b/gi, 'price');
  q = q.replace(/\b(increez|increse|inkreez)\b/gi, 'increase');
  q = q.replace(/\b(decreez|dicrease|dikreez)\b/gi, 'decrease');
  q = q.replace(
    /\b(petrol|diesel|fuel)\s*(ki|ke|ka)?\s*(keemat|qimat|qiymat|kimat|price|rate|praiz)\b/gi,
    '$1 price',
  );
  q = q.replace(/پٹرول|پیٹرولیم/g, 'petrol');
  q = q.replace(/ڈیزل/g, 'diesel');
  q = q.replace(/پرائز|پرائیس/g, 'price');
  q = q.replace(/انکریز/g, 'increase');
  q = q.replace(/ڈیکریز/g, 'decrease');

  // Nastaliq / mixed: bitcoin/سونا|سونے/پیٹرول + قیمت/پرائز
  // Map inflected gold forms first so detectPlugin sees English "gold".
  q = q.replace(/سونے|سونا|گولڈ/g, 'gold');
  if (/قیمت|ریٹ|پرائز|price|increase|decrease/i.test(q)) {
    if (/بٹ\s*کوائن|بٹکوائن|بٹ\s*کون|bitcoin|btc/i.test(q) || /بی\s*ٹی\s*سی/.test(raw)) {
      q = `bitcoin price ${q}`;
    } else if (/\bgold\b/i.test(q)) {
      q = `gold price ${q}`;
    } else if (/ایتھیریم|ethereum|eth/i.test(q)) {
      q = `ethereum price ${q}`;
    } else if (/پیٹرول|پٹرول|ڈیزل|petrol|diesel|fuel|ایندھن/i.test(q)) {
      q = `diesel price ${q}`;
    }
  }

  return q.replace(/\s+/g, ' ').trim();
}

/** e.g. "62899 or 62829 ?" after a BTC quote — treat as live bitcoin ask */
function isPriceClarifyQuery(q: string): boolean {
  const s = clean(q).replace(/\?/g, '').trim();
  return /^\d{3,7}(\s*(or|vs|versus|to|-|\/)\s*\d{3,7})?$/.test(s);
}

function isSimplePriceCheck(q: string): boolean {
  const s = clean(q).toLowerCase();
  // Clear asset+price asks are always simple live quotes — even with Roman Urdu
  // question particles ("kya hai", "aaj", "yaar") that are not analysis words.
  const clearLivePrice =
    (/\b(bitcoin|btc|ethereum|eth|solana|sol|gold|xau|petrol|diesel|fuel)\b/.test(s) ||
      /بٹ\s*کوائن|بٹکوائن|ایتھیریم|سونا|سونے|گولڈ|پیٹرول|پٹرول|ڈیزل/.test(q)) &&
    (/\b(price|rate|spot|keemat|qimat|qiymat|kimat|worth|how much)\b/.test(s) ||
      /قیمت|ریٹ|پرائز|پرائیس/.test(q));
  if (clearLivePrice) return true;

  // If it contains question words, analysis words, or intent to know reasons/causes
  if (
    /\b(why|how|reason|because|war|wars|news|explain|explanation|detail|details|predict|prediction|forecast|trend|affect|impact|batao|bataen|bataiye|sunao|sunayein|bolo|bolain|likho|likhein|kya\s+hua|kia\s+hua|kyun|kyu|ku|wajah|وجہ|کیوں|ہوا|did|is\s+it|up|down|going|go|drop|fell|fall|rose|rise|rally|dump|crash|change|percent|percentage)\b/i.test(
      s,
    )
  ) {
    return false;
  }
  // Vague follow-ups or general questions like "tell me more", "or", "and?", "aur?"
  if (isVagueFollowUp(q)) {
    return false;
  }
  return true;
}

function detectPlugin(q: string): Plugin {
  const s = clean(q);
  if (isGreeting(s)) return { kind: 'greeting' };

  if (
    /^(weather|forecast|temperature|humidity)$/.test(s) ||
    (/\b(weather|forecast|temperature|humidity|mosam|mosaam|موسم)\b/.test(s) &&
      !/\b(oil|stock|market|bitcoin|crypto|gold|ai|nvidia|news)\b/.test(s))
  ) {
    const cities = extractWeatherCitiesFromAsk(s);
    if (!cities.length) {
      // Do not invent Karachi/London — ask the user which city.
      return { kind: 'weather', city: '', cityAsked: false };
    }
    return { kind: 'weather', city: cities.join(', '), cityAsked: true };
  }

  if (isPriceClarifyQuery(s)) {
    // Coin resolved later from session (last crypto), not forced to bitcoin here.
    return { kind: 'crypto_price', cryptoId: 'pending' };
  }

  const priceAsk = wantsLivePrice(q) || /\b(increasing|decreasing|up or down)\b/.test(s);
  const mentionsBtc = /\b(bitcoin|btc)\b/.test(s) || /بٹ\s*کوائن|بٹکوائن/.test(q);
  const mentionsEth = /\b(ethereum|eth)\b/.test(s) || /ایتھیریم/.test(q);
  const mentionsSol = /\b(solana|sol)\b/.test(s);
  const mentionsGold = /\b(gold|xau|bullion|sona|sone|sonay)\b/.test(s) || /سونا|سونے|گولڈ/.test(q);
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

/** Auto-detect professional domain for category-pinned retrieval. */
type DomainHint = {
  category: string;
  searchOverride: string;
  topicLabel: string;
  /** Items must literally match this or we serve the honest latest-fallback. */
  mustMatch?: RegExp;
} | null;
function detectDomainHint(q: string): DomainHint {
  const s = clean(q);

  // Named outlets — always from THIS query string (never sticky prior outlet).
  if (/\bbbc\b/i.test(s) || /بی\s*بی\s*سی/.test(q)) {
    return {
      category: 'global',
      searchOverride: 'BBC news world politics BBC.com latest headlines',
      topicLabel: 'BBC News',
      mustMatch: /\bbbc\b/i,
    };
  }
  if (/\breuters\b/i.test(s) || /روئٹرز|رائٹرز/.test(q)) {
    return {
      category: 'global',
      searchOverride: 'Reuters news world politics markets',
      topicLabel: 'Reuters',
      mustMatch: /\breuters\b/i,
    };
  }
  if (/\b(the\s+)?guardian\b/i.test(s)) {
    return {
      category: 'global',
      searchOverride: 'Guardian news world politics technology',
      topicLabel: 'The Guardian',
      mustMatch: /\bguardian\b/i,
    };
  }
  if (/\bal\s*jazeera\b|\baljazeera\b/i.test(s)) {
    return {
      category: 'global',
      searchOverride: 'Al Jazeera news world middle east',
      topicLabel: 'Al Jazeera',
      mustMatch: /\bal\s*jazeera\b|\baljazeera\b/i,
    };
  }

  // Dawn newspaper / Dawn opinions — pin global feeds and require Dawn attribution.
  if (
    /\b(dawn(?:\s+(?:news|newspaper|paper|editorial|editorials|opinion|opinions|column|columns))?)\b/i.test(
      s,
    ) ||
    /\bdawn\s+(?:ka|ki|ke)\b/i.test(s) ||
    /ڈان/.test(q)
  ) {
    const wantsOpinion = /\b(opinion|opinions|editorial|editorials|column|columns|view|views|stance|analysis)\b/i.test(
      s,
    ) || /رائے|اداریہ|کالم/.test(q);
    return {
      category: 'global',
      searchOverride: wantsOpinion
        ? 'Dawn opinion editorial column Pakistan Dawn.com analysis view'
        : 'Dawn news Pakistan Dawn.com politics editorial',
      topicLabel: wantsOpinion ? 'Dawn Opinions' : 'Dawn News',
      mustMatch: /\bdawn\b/i,
    };
  }

  // Macro / economy / markets surveys — pin trading feeds; no mustMatch
  // (headlines rarely contain the word "macroeconomic").
  if (
    /\b(macro(?:economic|economics)?|econom(?:y|ic|ics)|inflation|gdp|recession|interest rates?|central banks?|monetary|fiscal|tariffs?|trade deal|bond yields?)\b/i.test(
      s,
    )
  ) {
    return {
      category: 'trading',
      searchOverride:
        'macroeconomy inflation gdp trade tariff fed interest rates central bank markets recession employment',
      topicLabel: 'Macroeconomic News',
    };
  }

  // Broad "new technologies / innovation" surveys → tech+ai recall.
  if (
    /\b(new technolog(?:y|ies)|emerging technolog(?:y|ies)|tech trends?|innovation(?:s)? (?:news|today|latest)|latest tech)\b/i.test(
      s,
    )
  ) {
    return {
      category: 'tech',
      searchOverride: 'technology AI chip semiconductor startup innovation product launch model',
      topicLabel: 'New Tech Trends',
    };
  }

  // GitHub / Open-source / DevOps
  if (
    /\b(github|trending repo|trending repos|open.?source|repository|repositories|devops|docker|kubernetes|k8s|npm package|open source project|hacker news|hackernews|lobster|infoq)\b/i.test(s)
  ) {
    const isDevOps = /\b(docker|kubernetes|k8s|devops|ci.?cd|deployment|container)\b/i.test(s);
    return {
      category: 'github',
      searchOverride: isDevOps
        ? 'docker kubernetes devops ci/cd cloud deployment container'
        : s.includes('hacker') ? 'hacker news tech'
        : 'github open source trending repository developer tools',
      topicLabel: isDevOps ? 'DevOps & Cloud' : 'GitHub & Open Source',
    };
  }

  // AI / LLM model releases
  if (
    /\b(llm|large language model|gpt-?[45]|claude [34]|gemini [12]|llama [23]|mistral|grok|qwen|deepseek|phi-?[234]|new model|ai model|model release|model launch|foundation model|open source llm)\b/i.test(s)
  ) {
    return {
      category: 'ai',
      searchOverride: 'AI model release LLM GPT Claude Gemini Llama open source',
      topicLabel: 'AI / LLM Releases',
    };
  }

  // Framework / Developer tools releases
  if (
    /\b(next\.?js|react [0-9]+|vue [0-9]+|angular [0-9]+|svelte|bun|deno|node\.?js|typescript [0-9]+|python [0-9]+|rust [0-9]+|django|fastapi|laravel|rails|framework release|sdk release|library release|vs.?code|visual studio|jetbrains|github copilot)\b/i.test(s)
  ) {
    return {
      category: 'github',
      searchOverride: 'developer tools framework release update programming language',
      topicLabel: 'Dev Tools & Framework Releases',
    };
  }

  // Tech layoffs / job market
  if (
    /\b(layoffs?|laid off|job cuts?|fired engineers?|tech jobs?|hiring freeze|redundanc|reorg|workforce reduction|engineers? job|software jobs?|remote jobs?)\b/i.test(s)
  ) {
    return {
      category: 'tech',
      searchOverride: 'tech layoffs job cuts engineers fired hiring technology workforce',
      topicLabel: 'Tech Jobs & Layoffs',
      mustMatch: /\b(layoffs?|laid off|lay off|job cuts?|jobs? cut|workforce reduction|redundanc\w*|downsizing|fires?d? \d|cutting \d+[,\d]* (jobs|roles|positions)|hiring freeze)\b/i,
    };
  }

  // Cybersecurity / CVE alerts
  if (
    /\b(cve|vulnerability|vulnerabilities|zero.?day|exploit|ransomware|malware|data breach|cyberattack|cyber attack|phishing|ddos|security flaw|patch tuesday|nvd|mitre|owasp|infosec|hack(ed|ing)?|breach(ed)?)\b/i.test(s)
  ) {
    return {
      category: 'tech',
      searchOverride: 'cybersecurity vulnerability CVE exploit breach ransomware malware security',
      topicLabel: 'Cybersecurity & CVE Alerts',
      mustMatch: /\b(cve-?\d*|vulnerabilit\w*|zero.?day|exploit\w*|ransomware|malware|breach\w*|cyber.?attack|phishing|ddos|patch(es|ed)?|security (flaw|hole|bug|update)|hack(ed|ers?|ing)?|infosec|threat actor)\b/i,
    };
  }

  return null;
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
  opts?: {
    /** URLs already shown to this chat — skipped when newer coverage exists so "more" never repeats. */
    excludeUrls?: Set<string>;
    /** Hard topical gate (from domain hints): items must match or we fall back honestly. */
    mustMatch?: RegExp;
  },
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
    const pool = opts?.excludeUrls?.size
      ? fresh.filter((i) => !opts.excludeUrls!.has(i.url)) 
      : fresh;
    const latest = [...(pool.length ? pool : fresh)]
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

  // Hard topical gate for domain-hint searches (layoffs, CVE, …): the broad
  // keyword override can match stories that never mention the actual topic.
  // Only keep items that literally cover it; otherwise fall through to the
  // honest latest-fallback path instead of grounding on unrelated articles.
  let usedLatestFallback = false;
  if (opts?.mustMatch && scored.length) {
    const direct = scored.filter((i) =>
      opts.mustMatch!.test(
        `${i.title} ${i.description || ''} ${i.source || ''} ${i.url || ''}`,
      ),
    );
    if (direct.length) {
      scored = direct;
    } else {
      scored = [];
    }
  }

  // Pass 5: never return empty when the feed pool has stories — serve freshest as best available
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

  // Variety on follow-ups: skip stories this chat has already seen so "more"
  // brings NEW coverage (often from other sources). Only when enough unseen
  // items remain — repeating is still better than an empty reply.
  if (opts?.excludeUrls?.size && scored.length) {
    const seen = opts.excludeUrls;
    let unseen = scored.filter((i) => !seen.has(i.url));
    if (unseen.length < limit) {
      // Strict scoring can leave zero unseen matches (all top stories already
      // shown). Widen with soft topical matches from the rest of the pool so
      // "more" still brings NEW coverage instead of repeating.
      const already = new Set(scored.map((i) => i.url));
      const soft = [...new Set([...tokens, ...expanded])].filter((t) => t.length >= 4);
      const extras = fresh
        .filter((i) => {
          if (seen.has(i.url) || already.has(i.url)) return false;
          const hay = `${i.title} ${i.description || ''}`;
          return opts.mustMatch
            ? opts.mustMatch.test(hay)
            : soft.some((t) => hay.toLowerCase().includes(t));
        })
        .slice(0, limit * 3)
        .map(
          (i) =>
            ({
              ...i,
              matchScore: 7,
              score: 7 + Math.min(2, i.significance / 5) + freshnessBonus(i.publishedAt),
              matchedTerms: ['related'],
            }) as QueryResultItem,
        );
      unseen = [...unseen, ...extras];
    }
    if (unseen.length >= Math.min(limit, 2)) {
      scored = unseen;
    } else if (unseen.length) {
      scored = [...unseen, ...scored.filter((i) => seen.has(i.url))];
    }
  }

  const picked = pickDiverse(scored, limit);

  // Relevance gate: soft/category fallbacks (passes 3-4) can select stories that
  // never mention the actual topic (e.g. "layoffs", "CVE"). If none of the
  // specific query terms appear in any picked title/description, treat the
  // result as latest-fallback so the reply is honest instead of a confident
  // grounded answer about unrelated articles.
  if (!usedLatestFallback && picked.length) {
    // Gate only on the user's OWN specific terms — synonym expansions of a
    // generic word ("tech" → "software") must not make a generic ask strict.
    const meaningfulBase = tokens.filter((t) => t.length >= 4 && !GENERIC_QUERY_TOKENS.has(t));
    if (meaningfulBase.length) {
      const probes = [...new Set(expandTokens(meaningfulBase))].filter((t) => t.length >= 4);
      const anyDirect = picked.some((i) => {
        const hay = `${i.title} ${i.description || ''}`.toLowerCase();
        return probes.some((t) => hay.includes(t));
      });
      if (!anyDirect) {
        // Abstract theme asks ("macroeconomic", "new technologies") almost never
        // appear literally in headlines — do not force the no-match template
        // here. The LLM relevance judge decides after hybrid fusion.
        if (!isAbstractTopicAsk(meaningfulBase) && !questionLooksAbstract(q)) {
          usedLatestFallback = true;
        }
      }
    }
  }

  return {
    items: picked,
    total: scored.length,
    poolSize: fresh.length,
    tokens,
    expanded,
    usedLatestFallback,
  };
}

/** Terms too generic to prove an article is actually about the user's topic. */
const GENERIC_QUERY_TOKENS = new Set([
  'tech', 'technology', 'technologies', 'news', 'today', 'latest', 'update', 'updates',
  'new', 'daily', 'announced', 'announcement', 'price', 'prices', 'market', 'markets',
  'world', 'global', 'breaking', 'report', 'reports', 'story', 'stories', 'about',
  'more', 'detail', 'details', 'info', 'information', 'explain', 'follow', 'user',
  'question', 'prior', 'result', 'results', 'reason', 'reasons', 'effect', 'effects',
  'record', 'coverage', 'batao', 'bataen', 'sunao', 'mazeed',
  'khabrein', 'khabren', 'khabar', 'khabrain', 'akhbar', 'khabarein', 'aaj', 'kal',
]);

/** Infer BTC/ETH/SOL from free text; null if none named. */
function inferCryptoIdFromText(...parts: Array<string | null | undefined>): 'bitcoin' | 'ethereum' | 'solana' | null {
  const hay = parts.filter(Boolean).join(' ');
  if (!hay.trim()) return null;
  if (/\bethereum\b|\beth\b|ایتھیریم/i.test(hay)) return 'ethereum';
  if (/\bsolana\b|\bsol\b/i.test(hay)) return 'solana';
  if (/\bbitcoin\b|\bbtc\b|بٹ\s*کوائن|بٹکوائن/i.test(hay)) return 'bitcoin';
  return null;
}

/**
 * True when the user names a new subject word not present in the prior ask
 * (e.g. "what about Apple?" after a gold thread) — without needing an entity catalog.
 */
function hasNovelSubjectTokens(incoming: string, previous: string): boolean {
  const stop = new Set([
    ...STOP_WORDS,
    'about',
    'regarding',
    'please',
    'latest',
    'today',
    'price',
    'prices',
    'up',
    'down',
    'more',
    'again',
    'still',
    'now',
  ]);
  const prev = new Set(
    previous
      .toLowerCase()
      .split(/[^a-z0-9\u0600-\u06ff]+/i)
      .filter((w) => w.length >= 3 && !stop.has(w)),
  );
  const words = incoming
    .toLowerCase()
    .split(/[^a-z0-9\u0600-\u06ff]+/i)
    .filter((w) => w.length >= 4 && !stop.has(w));
  return words.some((w) => !prev.has(w));
}

function buildWeatherCityClarify(lang: ReplyLanguage): string {
  if (lang === 'ur') {
    return [
      '*NewsDash Analyst*',
      '',
      '*موضوع:* موسم',
      'کس شہر کا موسم دیکھنا ہے؟ شہر کا نام لکھیں (مثلاً Zhob، Peshawar، Karachi)۔',
    ].join('\n');
  }
  return [
    '*NewsDash Analyst*',
    '',
    '*Topic:* Weather',
    'Which city should I check? Reply with a city name (e.g. Zhob, Peshawar, Karachi).',
  ].join('\n');
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
    const askedKey = asked.trim().toLowerCase();
    if (!askedKey || WEATHER_NON_CITY.has(askedKey)) {
      return { error: 'Which city should I check the weather for?', requestedCity: '' };
    }
    const geo = await geocode(asked);
    if (!geo) {
      return {
        error: `Could not find location "${asked}". Try a clearer city name.`,
        requestedCity: asked,
      };
    }
    const lat = geo.lat;
    const lon = geo.lon;
    const label = geo.label;
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

async function fetchCrypto(id: string, withPkr = true): Promise<CryptoQuote | null> {
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
    if (usdPkr) {
      quote.usdPkrRate = usdPkr;
      quote.wtiPkrApprox = Math.round(wti.price * usdPkr);
      if (brent?.price) quote.brentPkrApprox = Math.round(brent.price * usdPkr);
    }
    return quote;
  } catch {
    return null;
  }
}

/**
 * Pakistan petrol / diesel pump (ex-depot) prices in PKR/litre.
 * Prefer Shell/PakWheels national figures (not city-specific Octane Plus).
 */
async function fetchPakistanFuelPrices(): Promise<PakistanFuelQuote | null> {
  try {
    const res = await fetch('https://fuel.trackmate.page/api/prices', {
      headers: { Accept: 'application/json', 'User-Agent': 'NewsDash/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      prices?: Array<{
        source?: string;
        product?: string;
        price_pkr?: number;
        unit?: string;
        city?: string | null;
        effective_date?: string | null;
        scraped_at?: string;
      }>;
    };
    const rows = Array.isArray(data.prices) ? data.prices : [];
    const national = rows.filter((r) => !r.city);
    const pick = (product: string) => {
      const pool = national.filter(
        (r) => String(r.product || '').toLowerCase() === product && Number(r.price_pkr) > 0,
      );
      const ranked = [...pool].sort((a, b) => {
        const rank = (s?: string) =>
          s === 'shell' ? 0 : s === 'pakwheels' ? 1 : s === 'pso' ? 2 : 3;
        return rank(a.source) - rank(b.source);
      });
      return ranked[0] || null;
    };
    const petrol = pick('petrol');
    const diesel = pick('hsd') || pick('diesel');
    if (!petrol && !diesel) return null;
    const src = String(petrol?.source || diesel?.source || 'shell').toLowerCase();
    const primaryUrl =
      src === 'pso'
        ? 'https://psopk.com/en/products-services/fuel-prices'
        : src === 'pakwheels'
          ? 'https://www.pakwheels.com/fuel-prices-in-pakistan/'
          : 'https://www.shell.com.pk/motorists/shell-fuels/fuel-price.html';
    return {
      petrolPkr: Number(petrol?.price_pkr || 0),
      dieselPkr: Number(diesel?.price_pkr || 0),
      effectiveDate: String(petrol?.effective_date || diesel?.effective_date || '').trim() || undefined,
      source: src,
      scrapedAt: petrol?.scraped_at || diesel?.scraped_at,
      verifyUrls: [
        { label: src === 'pso' ? 'PSO' : src === 'pakwheels' ? 'PakWheels' : 'Shell PK', url: primaryUrl },
        { label: 'OGRA', url: 'https://ogra.org.pk/notified-petroleum-prices' },
        { label: 'Fuel feed', url: 'https://fuel.trackmate.page/' },
      ],
    };
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

/**
 * A live-price question (gold/bitcoin/…) must never be grounded on stories
 * that merely share a keyword (e.g. the arXiv "Gold Path" paper). Only keep
 * items that are actually about the asset or its market.
 */
function isAssetStory(
  item: Pick<NewsItem, 'title' | 'description'>,
  kind: 'gold' | 'crypto',
  cryptoId?: string,
): boolean {
  const hay = `${item.title} ${item.description || ''}`.toLowerCase();
  if (kind === 'gold') {
    return /\b(gold|xau|bullion|precious metals?|سونا|سونے)\b/i.test(hay);
  }
  const asset =
    cryptoId === 'ethereum'
      ? /\b(ethereum|ether|eth)\b/i
      : cryptoId === 'solana'
        ? /\b(solana|sol)\b/i
        : /\b(bitcoin|btc)\b/i;
  return asset.test(hay) || /\b(crypto|cryptocurrency|stablecoin|digital asset)\b/i.test(hay);
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

import { getPublicAppUrl } from '@/lib/app-url';

const SHORT_LINK_TIMEOUT_MS = 2500;

function makeBrandedRedirect(url: string): string {
  const b64 = Buffer.from(url.trim(), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${getPublicAppUrl()}/api/r/${b64}`;
}

/**
 * Shorten publisher URLs for WhatsApp (messy long links → short tappable https).
 * Prefer public shorteners; fall back to branded /api/r when shorter than original.
 */
async function shortenArticleUrl(url: string): Promise<string> {
  let original = url.trim();
  if (!isValidArticleUrl(original)) return original;

  // Strip tracking junk so shorteners / display stay tidy.
  try {
    const u = new URL(original);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) u.searchParams.delete(key);
    }
    original = u.toString();
  } catch {
    // keep original
  }

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
 * Compact source line: short article title (so the user can choose) + publisher + time.
 * Title is the primary label; never dump the long publisher URL into the chat body.
 */
function shortArticleTitle(title: string, max = 72): string {
  const t = String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/[\[\]*()]/g, '')
    .trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > Math.floor(max * 0.45) ? cut.slice(0, sp) : cut).trim()}…`;
}

function formatSourceLine(
  i: QueryResultItem,
  idx: number,
  showIndex: boolean,
  displayUrl: string,
): string {
  const when = formatTime(i.publishedAt);
  const publisher = (i.source || 'Source').replace(/[\[\]*()]/g, '').trim() || 'Source';
  const shortPub = publisher.length > 22 ? publisher.slice(0, 19) + '…' : publisher;
  const title = shortArticleTitle(i.title || '', 72);
  const idxBit = showIndex ? `${idx + 1}. ` : '';
  if (title) {
    const meta = [shortPub, when].filter(Boolean).join(' · ');
    return `• [${idxBit}${title}](${displayUrl})${meta ? ` · ${meta}` : ''}`;
  }
  return `• [${idxBit}${shortPub}](${displayUrl})${when ? ` · ${when}` : ''}`;
}

type SourceButton = { type: 'url'; text: string; url: string };

function buttonLabel(item: QueryResultItem, idx: number, total: number): string {
  const title = shortArticleTitle(item.title || '', 52);
  const base =
    title ||
    (item.source || 'Open article').replace(/[\[\]*]/g, '').trim() ||
    'Open article';
  let label = total > 1 ? `${idx + 1}. ${base}` : base;
  // Discord link-button labels allow up to 80 chars.
  if (label.length > 80) label = label.slice(0, 77) + '...';
  return label;
}

function buildSourceButtons(items: QueryResultItem[], displayUrls: string[]): SourceButton[] {
  return items
    .filter((i) => isValidArticleUrl(i.url))
    .slice(0, 3)
    .map((i, idx, arr) => ({
      type: 'url' as const,
      text: buttonLabel(i, idx, arr.length),
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
  history?: Array<{ role?: string; text?: string; content?: string }>,
  liveQuoteText?: string,
  needTag?: RagNeedTag,
  rollingSummary?: string,
): Promise<{
  text: string;
  answer: string;
  sources: GroundedSource[];
  sourceButtons: SourceButton[];
  displayUrls: string[];
  /** True only when the LLM produced a real grounded answer (safe to reuse as evidence). */
  grounded: boolean;
}> {
  const lang = langOverride ?? detectQueryLanguage(question);
  const topicHdr = localizedTopicLabel(topicLabel, lang);
  const topicKey = lang === 'ur' ? '*موضوع:*' : '*Topic:*';
  /** Rigid header template — last-resort / fallback paths only. */
  const templateHeader = ['*NewsDash Analyst*', '', `${topicKey} ${topicHdr}`];
  if (note) templateHeader.push(note);
  else if (closestCoverage && items.length) {
    templateHeader.push(
      lang === 'ur'
        ? '_قریب ترین تازہ کوریج:_'
        : '_Closest live coverage from NewsDash:_',
    );
  }

  if (!items.length) {
    // Live-price ask with no relevant news: the quote alone is a complete answer.
    if (liveQuoteText) {
      const answerLabel = lang === 'ur' ? '*جواب:*' : '*Answer:*';
      const tail =
        lang === 'ur'
          ? 'اس وقت فیڈز میں اس پر کوئی براہِ راست خبر نہیں — اوپر تازہ لائیو ریٹ ہے۔'
          : 'No directly related news in the feeds right now — the live rate above is the freshest data.';
      const parts = [...templateHeader, '', answerLabel, liveQuoteText, tail];
      return {
        text: parts.join('\n'),
        answer: liveQuoteText,
        sources: [],
        sourceButtons: [],
        displayUrls: [],
        grounded: false,
      };
    }
    // Empty result set: honest no-coverage (A2 pattern). Only mention syncing
    // when the entire feed pool is actually empty.
    setGroundingPath(currentRequestId, 'none', poolSize === 0 ? 'feeds_empty' : 'no_match_empty');
    const emptyNote =
      poolSize === 0
        ? lang === 'ur'
          ? 'NewsDash کی فیڈز ابھی دستیاب نہیں۔ ایک لمحے بعد دوبارہ پوچھیں، یا کوئی اور موضوع آزمائیں۔'
          : "I couldn't reach the live feeds just now. Try again in a moment, or ask about something else."
        : lang === 'ur'
          ? `نیوزڈیش کی تازہ فیڈز میں "${question.trim().slice(0, 60)}" سے متعلق براہِ راست کوریج نہیں ملی۔ مزید مخصوص سوال پوچھیں، یا میں تازہ ترین سرخیاں دکھا سکتا ہوں۔`
          : `No direct coverage found for "${question.trim().slice(0, 60)}" in NewsDash feeds right now. Try a more specific keyword, or ask me for the latest headlines.`;
    return {
      text: [...templateHeader, '', emptyNote].join('\n'),
      answer: emptyNote,
      sources: [],
      sourceButtons: [],
      displayUrls: [],
      grounded: false,
    };
  }

  const sources = await enrichGroundedSources(items);
  if (liveQuoteText) {
    sources.unshift({
      title: lang === 'ur' ? 'لائیو ریٹ کارڈ' : 'Live Price Quote Card',
      source: 'NewsDash Live API',
      url: getPublicAppUrl(),
      body: liveQuoteText,
    });
  }

  // When usedLatestFallback is true, articles are NOT relevant to the question —
  // they are the freshest items from the entire feed pool. Do NOT pass them to
  // the LLM (it will hallucinate a confident answer about unrelated stories).
  // Instead, skip grounding and show a honest "no direct match" note.
  // Rotate variants so consecutive empty-match turns don't share an identical sentence.
  if (closestCoverage) {
    setGroundingPath(currentRequestId, 'extractive', 'closest_coverage_nomatch');
    const qSlice = question.trim().slice(0, 60);
    const urVariants = [
      `نیوزڈیش کی تازہ فیڈز میں "${qSlice}" سے متعلق براہِ راست کوریج نہیں ملی۔ ذیل میں تازہ ترین عالمی خبریں ہیں — مزید مخصوص سوال پوچھیں۔`,
      `"${qSlice}" پر ابھی کوئی سیدھی میچ نہیں ملی۔ تازہ سرخیاں دے رہا ہوں — زیادہ مخصوص لفظ آزمائیں۔`,
      `اس موضوع ("${qSlice}") پر براہِ راست کوریج نہیں ملی۔ نیچے تازہ ترین ہیڈلائنز ہیں؛ کوئی اور زاویہ پوچھ سکتے ہیں۔`,
    ];
    const enVariants = [
      `No direct coverage found for "${qSlice}" in NewsDash feeds right now. Showing latest headlines instead — try a more specific keyword for a targeted answer.`,
      `I couldn't find a direct match for "${qSlice}" in the current feeds. Here are the newest headlines meanwhile — a sharper keyword usually helps.`,
      `Nothing on "${qSlice}" lined up cleanly in today's pool. Sharing the latest headlines below; feel free to rephrase with a more specific ask.`,
    ];
    const variants = lang === 'ur' ? urVariants : enVariants;
    const pick = noMatchVariantSeq++ % variants.length;
    const noMatchNote = variants[pick];
    const displayUrls = await Promise.all(items.map((i) => shortenArticleUrl(i.url)));
    const sourceButtons = buildSourceButtons(items, displayUrls);
    const answerLabel = lang === 'ur' ? '*جواب:*' : '*Answer:*';
    const sourcesLabel = lang === 'ur' ? '*ذرائع:*' : '*Sources*';
    const parts = [...templateHeader, '', answerLabel, noMatchNote, '', sourcesLabel];
    const showIndex = items.length > 1;
    parts.push(
      items.map((i, idx) => formatSourceLine(i, idx, showIndex, displayUrls[idx])).join('\n\n'),
    );
    return {
      text: parts.join('\n'),
      answer: noMatchNote,
      sources,
      sourceButtons,
      displayUrls,
      grounded: false,
    };
  }

  const groundedResult = await buildGroundedAnswerWithPath(
    question,
    sources,
    lang,
    history,
    { needTag, rollingSummary },
  );
  let answer = groundedResult.answer;
  if (groundedResult.path === 'llm') {
    setGroundingPath(currentRequestId, 'llm');
  } else {
    setGroundingPath(currentRequestId, groundedResult.path === 'skipped' ? 'skipped' : 'fallback', groundedResult.reason);
  }

  // If we asked for Urdu but the model replied in English (common with English
  // source text), translate the body once so labels and narrative stay aligned.
  if (answer && lang === 'ur' && !/[\u0600-\u06FF]/.test(answer)) {
    const translated = await translateAnswerText(answer, 'ur');
    if (translated && /[\u0600-\u06FF]/.test(translated)) answer = translated;
  }
  if (answer && lang === 'en' && /[\u0600-\u06FF]/.test(answer) && !/[a-zA-Z]{4,}/.test(answer)) {
    const translated = await translateAnswerText(answer, 'en');
    if (translated) answer = translated;
  }

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
  // Extractive fallback quotes raw article text — good enough to display, but
  // never store it as conversation evidence (it compounds into garbage threads).
  let grounded = true;
  if (!answer || answer.length < WA_ANSWER_MIN || weak) {
    answer = buildExtractiveAnswer(question, sources, lang);
    grounded = false;
    setGroundingPath(currentRequestId, 'extractive', groundedResult.reason || 'weak_or_empty_llm');
  }

  const displayUrls = await Promise.all(items.map((i) => shortenArticleUrl(i.url)));
  const sourceButtons = buildSourceButtons(items, displayUrls);
  // Labels must match answer body script (avoid Urdu headers wrapping English extractive text).
  const bodyUrduChars = (String(answer).match(/[\u0600-\u06FF]/g) || []).length;
  const labelLang: ReplyLanguage =
    bodyUrduChars >= 40 ? 'ur' : bodyUrduChars < 8 && /[A-Za-z]{4,}/.test(String(answer)) ? 'en' : lang;
  const sourcesLabel = labelLang === 'ur' ? '*ذرائع:*' : '*Sources*';
  const showIndex = items.length > 1;
  const sourceBlock = items
    .map((i, idx) => formatSourceLine(i, idx, showIndex, displayUrls[idx]))
    .join('\n\n');

  // Grounded conversational voice: no rigid Topic/Answer header.
  // Fallback extractive path keeps the rigid template for observability.
  if (grounded) {
    const quoteBlock = liveQuoteText ? `${liveQuoteText}\n\n` : '';
    const text = `${quoteBlock}${answer}\n\n${sourcesLabel}\n${sourceBlock}`;
    return { text, answer, sources, sourceButtons, displayUrls, grounded };
  }

  const topicKeyAligned = labelLang === 'ur' ? '*موضوع:*' : '*Topic:*';
  const answerLabel = labelLang === 'ur' ? '*جواب:*' : '*Answer:*';
  const topicHdrAligned = localizedTopicLabel(topicLabel, labelLang);
  const extractiveHeader = ['*NewsDash Analyst*', '', `${topicKeyAligned} ${topicHdrAligned}`];
  if (note) extractiveHeader.push(note);
  const parts = [
    ...extractiveHeader,
    '',
    answerLabel,
    answer,
    '',
    sourcesLabel,
    sourceBlock,
  ];
  return { text: parts.join('\n'), answer, sources, sourceButtons, displayUrls, grounded };
}

function buildIdentityReply(lang: ReplyLanguage): string {
  if (lang === 'ur') {
    return [
      '*NewsDash Analyst*',
      '',
      '*تعارف:*',
      'میں NewsDash Analyst ہوں — ایک AI نیوز اسسٹنٹ۔ میں NewsDash کی لائیو فیڈز سے تازہ خبریں تلاش کر کے مختصر، ذرائع کے ساتھ جواب دیتا ہوں۔',
      '',
      'آپ مجھ سے پوچھ سکتے ہیں:',
      '• کسی بھی موضوع کی تازہ خبریں (AI، کرپٹو، سیکیورٹی، کاروبار)',
      '• لائیو قیمتیں — سونا، بٹ کوائن، تیل',
      '• کسی بھی شہر کا موسم',
      '• فالو اپ سوالات — "وجہ کیا ہے؟"، "مزید بتاؤ"، "اردو میں سمجھاؤ"',
    ].join('\n');
  }
  return [
    '*NewsDash Analyst*',
    '',
    '*About me:*',
    "I'm NewsDash Analyst — an AI news assistant. I search live NewsDash feeds and answer with a short grounded brief plus source links.",
    '',
    'You can ask me for:',
    '• Latest news on any topic (AI, crypto, security, business)',
    '• Live prices — gold, Bitcoin, oil',
    '• Weather in any city',
    '• Follow-ups — "why?", "explain more", "translate to Urdu"',
  ].join('\n');
}

function buildGreeting(lang: ReplyLanguage, greeting: string): string {
  const isSalam = /\b(?:salam|assalamualaikum|assalamu\s*alaikum)\b/i.test(greeting);
  if (lang === 'ur') {
    return [
      isSalam ? 'وعلیکم السلام! 👋' : 'خوش آمدید! 👋',
      '',
      'آج آپ کس بارے میں جاننا چاہیں گے؟',
      '',
      'تازہ خبریں، مارکیٹ ریٹس یا موسم — اپنا سوال اردو یا انگریزی میں آسانی سے پوچھیں۔',
    ].join('\n');
  }
  return [
    isSalam ? 'Wa alaikum assalam! 👋' : 'Hello! 👋',
    '',
    'Good to have you here. What would you like to know today?',
    '',
    'Ask naturally in English or Urdu — about the latest news, market prices, or weather.',
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

function buildMultiWeatherReply(
  topicLabel: string,
  rows: WeatherPayload[],
  lang: ReplyLanguage,
): string {
  if (rows.length === 1) return buildWeatherReply(topicLabel, rows[0], lang);
  const topicKey = lang === 'ur' ? '*موضوع:*' : '*Topic:*';
  const topicHdr = localizedTopicLabel(topicLabel, lang);
  const liveHdr = lang === 'ur' ? '*لائیو موسم*' : '*Live weather*';
  const lines = ['*NewsDash Analyst*', '', `${topicKey} ${topicHdr}`, '', liveHdr];
  for (const weather of rows) {
    if (weather.error) {
      lines.push(`• ${weather.requestedCity || 'City'}: ${weather.error}`);
      continue;
    }
    const stats =
      lang === 'ur'
        ? `${weather.temperature ?? '-'}°C, ${weather.condition || '-'} | نمی ${weather.humidity ?? '-'}% | ہوا ${weather.windKmh ?? '-'} کلومیٹر/گھنٹہ`
        : `${weather.temperature ?? '-'} C, ${weather.condition || '-'} | Humidity ${weather.humidity ?? '-'}% | Wind ${weather.windKmh ?? '-'} km/h`;
    lines.push(`• *${weather.location}* — ${stats}`);
  }
  return lines.join('\n');
}

/** Live quote cards are intentionally template-only (latency/cost) — no Topic/Answer scaffold. */
function buildGoldReply(_topicLabel: string, gold: GoldQuote, lang: ReplyLanguage): string {
  const usd = gold.price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const lines =
    lang === 'ur'
      ? [`سونے کی لائیو قیمت: *XAU* $${usd} / oz (USD)`]
      : [`Live gold: *XAU* $${usd} / oz (USD)`];
  if (gold.pkrPerTolaApprox && gold.usdPkrRate) {
    lines.push(
      lang === 'ur'
        ? `پاکستانی روپیہ: *Rs ${gold.pkrPerTolaApprox.toLocaleString('en-PK')} / تولہ* (تقریباً · ${gold.usdPkrRate.toFixed(2)} PKR/USD)`
        : `Pakistani Rupees: *Rs ${gold.pkrPerTolaApprox.toLocaleString('en-PK')} / tola* (approx · ${gold.usdPkrRate.toFixed(2)} PKR/USD)`,
    );
  } else {
    lines.push(
      lang === 'ur' ? 'PKR شرح ابھی دستیاب نہیں۔' : 'PKR rate temporarily unavailable.',
    );
  }
  return lines.join('\n');
}

function buildCryptoReply(_topicLabel: string, quote: CryptoQuote, lang: ReplyLanguage): string {
  const ch =
    quote.change24h == null
      ? ''
      : ` · 24h ${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%`;
  const usd = quote.usd.toLocaleString('en-US', {
    maximumFractionDigits: quote.usd >= 100 ? 2 : 4,
  });
  const lines =
    lang === 'ur'
      ? [`لائیو ${quote.name}: *$${usd}* (USD)${ch}`]
      : [`Live ${quote.name}: *$${usd}* (USD)${ch}`];
  if (quote.pkrApprox && quote.usdPkrRate) {
    lines.push(
      lang === 'ur'
        ? `پاکستانی روپیہ: *Rs ${quote.pkrApprox.toLocaleString('en-PK')}* (تقریباً · ${quote.usdPkrRate.toFixed(2)} PKR/USD)`
        : `Pakistani Rupees: *Rs ${quote.pkrApprox.toLocaleString('en-PK')}* (approx · ${quote.usdPkrRate.toFixed(2)} PKR/USD)`,
    );
  } else {
    lines.push(
      lang === 'ur' ? 'PKR شرح ابھی دستیاب نہیں۔' : 'PKR rate temporarily unavailable.',
    );
  }
  return lines.join('\n');
}

function buildFuelReply(_topicLabel: string, oil: OilQuote, lang: ReplyLanguage): string {
  const fmtCh = (n?: number) =>
    n == null ? '' : ` · 24h ${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const lines =
    lang === 'ur'
      ? [
          `لائیو بین الاقوامی تیل: *WTI* $${oil.wtiUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} / barrel (USD)${fmtCh(oil.wtiChange24h)}`,
        ]
      : [
          `Live international crude: *WTI* $${oil.wtiUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} / barrel (USD)${fmtCh(oil.wtiChange24h)}`,
        ];
  if (oil.wtiPkrApprox && oil.usdPkrRate) {
    lines.push(
      lang === 'ur'
        ? `WTI PKR: *Rs ${oil.wtiPkrApprox.toLocaleString('en-PK')} / barrel* (تقریباً)`
        : `WTI PKR: *Rs ${oil.wtiPkrApprox.toLocaleString('en-PK')} / barrel* (approx)`,
    );
  }
  if (oil.brentUsd) {
    lines.push(
      `*Brent* $${oil.brentUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} / barrel (USD)${fmtCh(oil.brentChange24h)}`,
    );
    if (oil.brentPkrApprox) {
      lines.push(
        lang === 'ur'
          ? `Brent PKR: *Rs ${oil.brentPkrApprox.toLocaleString('en-PK')} / barrel* (تقریباً)`
          : `Brent PKR: *Rs ${oil.brentPkrApprox.toLocaleString('en-PK')} / barrel* (approx)`,
      );
    }
  }
  if (!oil.usdPkrRate) {
    lines.push(
      lang === 'ur' ? 'PKR شرح ابھی دستیاب نہیں۔' : 'PKR rate temporarily unavailable.',
    );
  }
  return lines.join('\n');
}

function buildPakistanFuelReply(
  fuel: PakistanFuelQuote,
  lang: ReplyLanguage,
  displayLinks: Array<{ label: string; url: string }>,
  products: { petrol: boolean; diesel: boolean },
): string {
  const dateBit = fuel.effectiveDate
    ? lang === 'ur'
      ? ` (موثر: ${fuel.effectiveDate})`
      : ` (effective ${fuel.effectiveDate})`
    : '';
  const showPetrol = products.petrol && fuel.petrolPkr > 0;
  const showDiesel = products.diesel && fuel.dieselPkr > 0;
  const topic =
    showPetrol && showDiesel
      ? lang === 'ur'
        ? 'پاکستان پیٹرول / ڈیزل'
        : 'Pakistan petrol / diesel'
      : showDiesel
        ? lang === 'ur'
          ? 'پاکستان ڈیزل'
          : 'Pakistan diesel'
        : lang === 'ur'
          ? 'پاکستان پیٹرول'
          : 'Pakistan petrol';
  const lines =
    lang === 'ur'
      ? ['*NewsDash Analyst*', '', `*موضوع:* ${topic}`, `پاکستان پمپ قیمت${dateBit}:`]
      : ['*NewsDash Analyst*', '', `*Topic:* ${topic}`, `Pakistan pump price${dateBit}:`];
  if (showPetrol) {
    lines.push(
      lang === 'ur'
        ? `• *پیٹرول:* Rs ${fuel.petrolPkr.toLocaleString('en-PK')} / لیٹر`
        : `• *Petrol:* Rs ${fuel.petrolPkr.toLocaleString('en-PK')} / litre`,
    );
  }
  if (showDiesel) {
    lines.push(
      lang === 'ur'
        ? `• *ڈیزل (HSD):* Rs ${fuel.dieselPkr.toLocaleString('en-PK')} / لیٹر`
        : `• *Diesel (HSD):* Rs ${fuel.dieselPkr.toLocaleString('en-PK')} / litre`,
    );
  }
  lines.push('', lang === 'ur' ? '*ذرائع (تصدیق کریں):*' : '*Sources (verify):*');
  for (const link of displayLinks.slice(0, 3)) {
    lines.push(`• [${link.label}](${link.url})`);
  }
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
    // Pakistan pump quotes are validated separately; crude path still needs WTI.
    return { ok: false, reason: 'Live oil price unavailable. Please try again.' };
  }

  if (kind === 'news' && items?.length) {
    // Conversational replies no longer require rigid *Answer:* labels.
    // Require a usable answer body and that each source URL appears in the text.
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
  try {
    return await handleQueryPost(request);
  } catch (err) {
    // Always return JSON — an HTML 500 crashes channel clients mid-parse.
    console.error('[query] unhandled error', err);
    return Response.json({
      error: 'internal_error',
      intent: 'error',
      whatsappText: '*NewsDash Analyst*\n\nSomething went wrong on my side. Please ask again in a moment.',
      lastUpdated: new Date().toISOString(),
    });
  }
}

async function handleQueryPost(request: Request) {
  const requestId = newRequestId();
  beginTurnPaths(requestId);
  currentRequestId = requestId;
  const timer = createStageTimer(requestId);
  const respond = (data: Record<string, unknown>, status = 200) => {
    const paths = getTurnPaths(requestId) || {
      classify_turn: 'fallback' as const,
      grounding: 'none' as const,
    };
    logTurnPaths(requestId, { intent: data.intent });
    return Response.json({ ...data, paths }, { status });
  };
  const body = (await request.json().catch(() => null)) as QueryRequest | null;
  if (!body || typeof body.q !== 'string' || body.q.trim().length < 1) {
    return respond({ error: 'Provide a query string `q`.' }, 400);
  }

  const chatId = normalizeChatId(
    typeof body.chatId === 'string' ? body.chatId.trim() : '',
  );
  const incomingQ = body.q.trim();
  const replyLangEarly = detectQueryLanguage(incomingQ);
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const resolved = await resolveEffectiveQuery({
    rawQ: incomingQ,
    previousQ: typeof body.previousQ === 'string' ? body.previousQ : null,
    chatId,
    lang: replyLangEarly,
    history,
    previousIntent: typeof body.previousIntent === 'string' ? body.previousIntent : null,
  });

  if (resolved.needsClarify && resolved.clarifyText) {
    // Prefer LLM clarification when possible (Phase 3/4); static text is last resort.
    // Never pass the full canned menu into the LLM — it gets echoed into the reply.
    setClassifyPath(requestId, 'heuristic', 'needs_clarify');
    setGroundingPath(requestId, 'none', 'clarify');
    const convState = await getConversationStateForChat(chatId);
    const llmClarify = await buildConversationalReply(incomingQ, {
      lang: replyLangEarly,
      mode: 'clarification',
      clarifyReason: 'Ambiguous follow-up with no prior topic in this chat',
      rollingSummary: convState?.rollingSummary,
      recentTurns: convState?.recentTurns,
    });
    return respond({
      query: incomingQ,
      rawQuery: incomingQ,
      displayTopic: 'Clarify',
      intent: 'clarify',
      brief: 'Need a clearer question',
      items: [],
      total: 0,
      whatsappText: llmClarify || resolved.clarifyText,
      usedMemory: false,
      lastUpdated: new Date().toISOString(),
    });
  }

  // Conversational classifier — small talk / clarification skip retrieval.
  // Translate evidence-reuse still wins when clearly a language switch.
  // Elaborate from the regex cascade must NOT skip the classifier — that was
  // the B1 bug (topic switches mislabeled "elaborate" never reached classifyTurn).
  const convStateEarly = await getConversationStateForChat(chatId);
  const isBareGreeting =
    /^(hi|hello|hey|salam|assalamualaikum|hola|yo|help|start|menu)$/i.test(
      incomingQ.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(),
    ) && !convStateEarly?.topics?.length;

  let turnClass: TurnClassification | null = null;
  let classifyMeta: { path: 'llm' | 'heuristic' | 'fallback'; reason?: string } | null = null;
  if (!isBareGreeting && resolved.followUpKind !== 'translate') {
    const classified = await classifyTurn(incomingQ, convStateEarly);
    turnClass = classified.classification;
    classifyMeta = classified.meta;
    setClassifyPath(requestId, classified.meta.path, classified.meta.reason);
  } else if (resolved.followUpKind === 'translate') {
    setClassifyPath(requestId, 'heuristic', 'translate_ask');
  } else {
    setClassifyPath(requestId, 'heuristic', 'bare_greeting');
  }

  // Classifier overrides stale elaborate/more labels on clear topic changes.
  if (
    turnClass &&
    (turnClass.kind === 'new_topic' ||
      turnClass.kind === 'plugin' ||
      turnClass.kind === 'small_talk' ||
      turnClass.kind === 'clarification_needed' ||
      turnClass.kind === 'translate_previous') &&
    (resolved.followUpKind === 'elaborate' || resolved.followUpKind === 'more')
  ) {
    resolved.followUpKind = undefined;
    resolved.followUpText = undefined;
    resolved.memoryIntent = undefined;
    if (turnClass.kind === 'new_topic') {
      resolved.effectiveQ = turnClass.effectiveQuery;
      resolved.usedMemory = Boolean(convStateEarly);
    }
  }

  // Classifier translate_previous → same evidence-reuse path as translateAskTarget.
  if (turnClass?.kind === 'translate_previous') {
    resolved.followUpKind = 'translate';
    resolved.preferredLang = turnClass.targetLang;
    resolved.usedMemory = true;
  }

  // Classifier continue_topic with wantsNewInfo → fetch additional stories (not rewrite).
  if (turnClass?.kind === 'continue_topic' && turnClass.wantsNewInfo) {
    resolved.followUpKind = 'more';
    resolved.followUpText = incomingQ;
    resolved.usedMemory = true;
  }

  // Dawn menu pick must not be swallowed by LLM small-talk / clarify paths.
  const dawnTopicEarly = convStateEarly?.topics?.find((t) => t.intent === DAWN_OPINION_LIST_INTENT);
  const dawnMenuPendingEarly =
    isDawnOpinionMenuPending({
      memoryIntent: resolved.memoryIntent || dawnTopicEarly?.intent,
      topicIntent: dawnTopicEarly?.intent,
      lastBrief: dawnTopicEarly?.lastAnswerBrief,
      lastAnswer: dawnTopicEarly?.lastAnswer || resolved.lastAnswer,
    }) || Boolean(dawnTopicEarly?.lastSources?.length);
  const dawnPickAttemptEarly =
    dawnMenuPendingEarly &&
    !isDawnOpinionListAsk(incomingQ) &&
    !(Boolean(detectDomainHint(incomingQ)?.mustMatch) && !isDawnOpinionListAsk(incomingQ)) &&
    looksLikeDawnPickAttempt(incomingQ);
  if (
    dawnPickAttemptEarly &&
    turnClass &&
    (turnClass.kind === 'small_talk' || turnClass.kind === 'clarification_needed')
  ) {
    turnClass = null;
    classifyMeta = { path: 'heuristic', reason: 'dawn_menu_pick' };
    setClassifyPath(requestId, 'heuristic', 'dawn_menu_pick');
  }

  const pathsPayload = (): TurnPathLog => {
    const p = getTurnPaths(requestId);
    return {
      classify_turn: classifyMeta?.path || p?.classify_turn || 'fallback',
      classify_reason: classifyMeta?.reason || p?.classify_reason,
      grounding: p?.grounding || 'none',
      grounding_reason: p?.grounding_reason,
    };
  };
  const withPaths = <T extends Record<string, unknown>>(data: T): T & { paths: TurnPathLog } => {
    // Refresh classify meta onto the shared store before snapshotting.
    if (classifyMeta) setClassifyPath(requestId, classifyMeta.path, classifyMeta.reason);
    const paths = pathsPayload();
    logTurnPaths(requestId, { intent: data.intent, chatId });
    return { ...data, paths };
  };

  if (turnClass?.kind === 'small_talk') {
    setGroundingPath(requestId, 'none', 'small_talk');
    const replyLangSt =
      resolveReplyLanguage(incomingQ, incomingQ, body.replyLang || body.lang || resolved.preferredLang);
    // Identity questions keep the dedicated canned reply (accurate capabilities list).
    if (isIdentityAsk(incomingQ)) {
      return Response.json(
        withPaths({
          query: incomingQ,
          rawQuery: incomingQ,
          displayTopic: replyLangSt === 'ur' ? 'تعارف' : 'About NewsDash Analyst',
          intent: 'identity',
          brief: 'Identity / persona question',
          items: [],
          total: 0,
          whatsappText: buildIdentityReply(replyLangSt),
          usedMemory: false,
          lastUpdated: new Date().toISOString(),
        }),
      );
    }
    const chatReply =
      (await buildConversationalReply(incomingQ, {
        lang: replyLangSt,
        style: turnClass.suggestedReplyStyle,
        mode: 'small_talk',
        rollingSummary: convStateEarly?.rollingSummary,
        recentTurns: convStateEarly?.recentTurns,
      })) ||
      (replyLangSt === 'ur'
        ? 'شکریہ! خبریں، قیمتیں یا موسم پوچھیں — میں یہاں ہوں۔'
        : "Thanks! Ask me about news, prices, or weather anytime.");
    return Response.json(
      withPaths({
        query: incomingQ,
        rawQuery: incomingQ,
        displayTopic: replyLangSt === 'ur' ? 'گفتگو' : 'Chat',
        intent: 'small_talk',
        brief: 'Conversational reply',
        items: [],
        total: 0,
        whatsappText: chatReply,
        usedMemory: Boolean(convStateEarly),
        lastUpdated: new Date().toISOString(),
      }),
    );
  }

  if (turnClass?.kind === 'clarification_needed') {
    setGroundingPath(requestId, 'none', 'clarification');
    const replyLangCl =
      resolveReplyLanguage(incomingQ, incomingQ, body.replyLang || body.lang || resolved.preferredLang);
    const clarify =
      (await buildConversationalReply(incomingQ, {
        lang: replyLangCl,
        mode: 'clarification',
        clarifyReason: turnClass.reason,
        rollingSummary: convStateEarly?.rollingSummary,
        recentTurns: convStateEarly?.recentTurns,
      })) || turnClass.reason;
    return Response.json(
      withPaths({
        query: incomingQ,
        rawQuery: incomingQ,
        displayTopic: 'Clarify',
        intent: 'clarify',
        brief: turnClass.reason,
        items: [],
        total: 0,
        whatsappText: clarify,
        usedMemory: Boolean(convStateEarly),
        lastUpdated: new Date().toISOString(),
      }),
    );
  }

  // Classifier may rewrite the effective lookup for continue/new topic.
  let classifiedEffectiveQ: string | null = null;
  let classifiedTopicId: string | null = null;
  let forceNewTopic = false;
  let classifiedDisplayLabel: string | null = null;
  if (turnClass?.kind === 'continue_topic') {
    classifiedEffectiveQ = turnClass.effectiveQuery;
    classifiedTopicId = turnClass.topicId;
  } else if (turnClass?.kind === 'new_topic') {
    classifiedEffectiveQ = turnClass.effectiveQuery;
    classifiedDisplayLabel = turnClass.displayLabel;
    forceNewTopic = true;
  } else if (turnClass?.kind === 'plugin') {
    classifiedEffectiveQ = turnClass.effectiveQuery;
  }

  // Named-outlet switch: "bbc news today" after a Dawn thread must NOT keep
  // Dawn's effectiveQuery / mustMatch — that produced empty "no coverage" replies.
  const incomingOutlet = detectDomainHint(incomingQ);
  if (incomingOutlet?.mustMatch) {
    const merged = String(classifiedEffectiveQ || resolved.effectiveQ || '');
    const otherOutletStuck =
      (/\bdawn\b/i.test(merged) && !/\bdawn\b/i.test(incomingQ)) ||
      (/\bbbc\b/i.test(merged) && !/\bbbc\b/i.test(incomingQ)) ||
      (/\breuters\b/i.test(merged) && !/\breuters\b/i.test(incomingQ)) ||
      (/\bguardian\b/i.test(merged) && !/\bguardian\b/i.test(incomingQ)) ||
      (!incomingOutlet.mustMatch.test(merged) &&
        (turnClass?.kind === 'continue_topic' || Boolean(resolved.usedMemory)));
    if (otherOutletStuck) {
      classifiedEffectiveQ = incomingQ;
      classifiedDisplayLabel = incomingOutlet.topicLabel;
      classifiedTopicId = null;
      forceNewTopic = true;
    }
  }

  const rawQ = normalizeVoiceQuery(
    (classifiedEffectiveQ || resolved.effectiveQ).trim(),
  );
  if (rawQ.length < 2) {
    return Response.json({ error: 'Provide a query string `q`.' }, { status: 400 });
  }
  // Memory language preference only applies to vague follow-ups — a clear
  // English (or Urdu) question always answers in its own language.
  // Translate asks always take the requested target language verbatim.
  const replyLang =
    resolved.followUpKind === 'translate' && resolved.preferredLang
      ? resolved.preferredLang
      : resolveReplyLanguage(
          incomingQ,
          rawQ,
          body.replyLang || body.lang || (isVagueFollowUp(incomingQ) ? resolved.preferredLang : undefined),
        );

  // Identity / small-talk asks ("what's your name?", "tumhara naam kya hai?")
  // must never reach news retrieval — no news corpus can answer them, and the
  // vector index will happily return the closest garbage. Answer directly and
  // leave chat memory untouched so the previous news topic still continues.
  if (isIdentityAsk(incomingQ) || isIdentityAsk(rawQ)) {
    setGroundingPath(requestId, 'none', 'identity');
    return Response.json(
      withPaths({
        query: incomingQ,
        rawQuery: incomingQ,
        displayTopic: replyLang === 'ur' ? 'تعارف' : 'About NewsDash Analyst',
        intent: 'identity',
        brief: 'Identity / persona question',
        items: [],
        total: 0,
        whatsappText: buildIdentityReply(replyLang),
        usedMemory: false,
        lastUpdated: new Date().toISOString(),
      }),
    );
  }

  // Strip follow-up decorations ("— more detail / latest update", "User follow-up: …")
  // before tokenizing, so retrieval ranks on the real topic, not filler words.
  const q = extractTopicQuery(stableAsk(rawQ));
  const limit = Math.min(Math.max(body.limit ?? WA_STORY_LIMIT, 1), WA_STORY_LIMIT_MAX);
  let plugin = detectPlugin(q);

  // Classifier plugin wins when regex detectPlugin stayed on news
  if (turnClass?.kind === 'plugin' && plugin.kind === 'news') {
    if (turnClass.plugin === 'weather') {
      const cities = extractWeatherCitiesFromAsk(`${incomingQ} ${turnClass.effectiveQuery || q}`);
      plugin = {
        kind: 'weather',
        city: cities.length ? cities.join(', ') : '',
        cityAsked: cities.length > 0,
      };
    } else if (turnClass.plugin === 'gold_price') {
      plugin = { kind: 'gold_price' };
    } else if (turnClass.plugin === 'fuel_price') {
      plugin = { kind: 'fuel_price' };
    } else if (turnClass.plugin === 'crypto_price') {
      const fromAsk =
        inferCryptoIdFromText(incomingQ, turnClass.effectiveQuery, q) || 'pending';
      plugin = { kind: 'crypto_price', cryptoId: fromAsk };
    }
  }

  // Prefer explicit asset names in the *user's* message only — never scan
  // resolved `q`, which may still contain sticky "diesel petrol…" domain hints
  // and would force a pump card into every later reply.
  const incomingMentionsCrypto = /\b(bitcoin|btc|ethereum|eth|solana|sol)\b/i.test(incomingQ)
    || /بٹ\s*کوائن|بٹکوائن|ایتھیریم/.test(incomingQ);
  const incomingMentionsGold = /\b(gold|xau|sona|sone|sonay)\b/i.test(incomingQ)
    || /سونا|سونے|گولڈ/.test(incomingQ);
  const incomingMentionsFuel = /\b(petrol|diesel|gasoline|fuel|pump)\b/i.test(incomingQ)
    || /پیٹرول|پٹرول|ڈیزل|ایندھن|پمپ/.test(incomingQ);
  // Bare "oil" alone is crude/news — do not force the Pakistan pump card.

  const activeTopic =
    (convStateEarly?.activeTopicId &&
      convStateEarly.topics.find((t) => t.id === convStateEarly.activeTopicId)) ||
    convStateEarly?.topics?.[0];

  // Slot-fill: after "which city?", a short place reply must stay on weather —
  // even if the classifier says new_topic (city names look "novel").
  if (
    plugin.kind === 'news' &&
    !incomingMentionsCrypto &&
    !incomingMentionsGold &&
    !incomingMentionsFuel &&
    awaitingWeatherCitySlot({
      memoryIntent: resolved.memoryIntent || body.previousIntent,
      topicIntent: activeTopic?.intent,
      lastBrief: activeTopic?.lastAnswerBrief,
      lastAnswer: activeTopic?.lastAnswer,
    }) &&
    looksLikeCitySlotFill(incomingQ)
  ) {
    const cities = extractWeatherCitiesFromAsk(incomingQ);
    const city = cities[0] || stripWeatherFillers(incomingQ);
    if (city) {
      plugin = { kind: 'weather', city: normalizeCityQuery(city), cityAsked: true };
    }
  }

  const sessionHay = [
    activeTopic?.label,
    activeTopic?.lastQ,
    convStateEarly?.rollingSummary,
    resolved.effectiveQ,
  ]
    .filter(Boolean)
    .join(' ');

  // Sticky live-price intent ONLY for vague continues — never when the
  // classifier already decided this is a new topic / different plugin.
  // Using memoryIntent unconditionally was the B1 bug: "Iran situation"
  // stayed glued to crypto_price for the entire 15-turn thread.
  // (small_talk / clarification_needed already returned earlier.)
  const classifierOverridesSticky =
    turnClass?.kind === 'new_topic' ||
    turnClass?.kind === 'plugin' ||
    forceNewTopic;
  const novelSubject = hasNovelSubjectTokens(
    incomingQ,
    `${activeTopic?.label || ''} ${activeTopic?.lastQ || ''} ${resolved.effectiveQ || ''}`,
  );
  const stickyIntent =
    classifierOverridesSticky || novelSubject
      ? ''
      : isVagueFollowUp(incomingQ) && !incomingMentionsCrypto && !incomingMentionsGold && !incomingMentionsFuel
        ? String(resolved.memoryIntent || body.previousIntent || '').trim()
        : '';

  if (incomingMentionsCrypto) {
    const id = inferCryptoIdFromText(incomingQ, q) || 'bitcoin';
    plugin = { kind: 'crypto_price', cryptoId: id };
  } else if (incomingMentionsGold && !incomingMentionsFuel) {
    plugin = { kind: 'gold_price' };
  } else if (incomingMentionsFuel) {
    plugin = { kind: 'fuel_price' };
  } else if (plugin.kind === 'news' && stickyIntent) {
    if (stickyIntent === 'fuel_price') {
      // Only keep pump sticky for clear price follow-ups — not every later message.
      if (
        isSimplePriceCheck(incomingQ) ||
        /\b(price|rate|keemat|qimat|qiymat|kimat|kitna|kitni)\b/i.test(incomingQ) ||
        /قیمت|ریٹ|کتن/.test(incomingQ)
      ) {
        plugin = { kind: 'fuel_price' };
      }
    } else if (stickyIntent === 'gold_price') {
      plugin = { kind: 'gold_price' };
    } else if (stickyIntent === 'crypto_price') {
      plugin = {
        kind: 'crypto_price',
        cryptoId: inferCryptoIdFromText(sessionHay, activeTopic?.label, activeTopic?.lastQ) || 'bitcoin',
      };
    } else if (stickyIntent === 'weather') {
      // "and lahore?" after "weather in karachi" — a bare place name
      // continues the weather thread instead of falling into news search.
      const cityGuess = stripWeatherFillers(
        incomingQ
          .toLowerCase()
          .replace(/\b(and|aur|or|what about|how about)\b/gi, ' '),
      );
      if (
        cityGuess.length >= 3 &&
        cityGuess.split(' ').length <= 3 &&
        !cityGuess.split(' ').some((w) => WEATHER_NON_CITY.has(w))
      ) {
        plugin = { kind: 'weather', city: normalizeCityQuery(cityGuess), cityAsked: true };
      }
    }
  }

  // Resolve pending crypto id from session (never invent BTC when ETH/SOL was last).
  if (plugin.kind === 'crypto_price' && (plugin.cryptoId === 'pending' || !plugin.cryptoId)) {
    plugin = {
      kind: 'crypto_price',
      cryptoId:
        inferCryptoIdFromText(sessionHay, activeTopic?.label, activeTopic?.lastQ, incomingQ, q) ||
        'bitcoin',
    };
  }

  const topicLabel = displayTopic(q, plugin);
  const now = new Date().toISOString();
  const remember = async (
    topic: string,
    intent: string,
    answerBrief?: string,
    assistantText?: string,
    shownUrls?: string[],
    evidence?: { answer?: string; sources?: StoredSource[] },
  ) => {
    if (plugin.kind === 'greeting') return;
    await setChatMemory(chatId, rawQ, topic, {
      intent,
      answerBrief,
      preferredLang: replyLang,
      assistantText,
      userText: incomingQ,
      shownUrls,
      // Always persist answer text for translate/remind follow-ups; sources when grounded.
      answerFull: evidence?.answer || assistantText,
      sources: evidence?.sources,
      topicId: classifiedTopicId,
      forceNewTopic,
    });
  };

  // ── Dawn Opinion section: browse → pick → read (live RSS, not hardcoded titles) ──
  const dawnTopic = convStateEarly?.topics?.find((t) => t.intent === DAWN_OPINION_LIST_INTENT);
  const dawnMenuPending =
    isDawnOpinionMenuPending({
      memoryIntent: resolved.memoryIntent || activeTopic?.intent || dawnTopic?.intent,
      topicIntent: activeTopic?.intent || dawnTopic?.intent,
      lastBrief: activeTopic?.lastAnswerBrief || dawnTopic?.lastAnswerBrief,
      lastAnswer: activeTopic?.lastAnswer || resolved.lastAnswer || dawnTopic?.lastAnswer,
    }) || Boolean(dawnTopic?.lastSources?.length);
  const otherOutletAsk =
    Boolean(detectDomainHint(incomingQ)?.mustMatch) && !isDawnOpinionListAsk(incomingQ);

  if (isDawnOpinionListAsk(incomingQ) && !otherOutletAsk) {
    const dawnItems = await fetchDawnOpinionItems(8);
    const asQueryItems: QueryResultItem[] = dawnItems.map((d, i) => ({
      id: `dawn-op-${i}`,
      title: d.title,
      description: d.body || '',
      url: d.url,
      source: d.source,
      category: 'global' as const,
      publishedAt: d.publishedAt || now,
      significance: 50,
      tags: ['opinion'],
      matchScore: 50,
      score: 50,
      matchedTerms: ['dawn', 'opinion'],
    }));
    const displayUrls = await Promise.all(asQueryItems.map((i) => shortenArticleUrl(i.url)));
    const sourceButtons = buildSourceButtons(asQueryItems, displayUrls);
    const whatsappText = buildDawnOpinionListReply(dawnItems, replyLang, (item, idx) =>
      formatSourceLine(
        {
          ...asQueryItems[idx],
          title: item.title,
        },
        idx,
        true,
        displayUrls[idx],
      ),
    );
    const stored = dawnItemsToStoredSources(dawnItems);
    await setChatMemory(chatId, 'Dawn Opinion', 'Dawn Opinion', {
      intent: DAWN_OPINION_LIST_INTENT,
      answerBrief: `Dawn Opinion menu (${dawnItems.length})`,
      preferredLang: replyLang,
      assistantText: whatsappText,
      userText: incomingQ,
      shownUrls: dawnItems.map((d) => d.url),
      answerFull: whatsappText,
      sources: stored,
      forceNewTopic: true,
    });
    setGroundingPath(requestId, 'none', 'dawn_opinion_list');
    return Response.json(
      withPaths({
        query: q,
        rawQuery: incomingQ,
        displayTopic: 'Dawn Opinion',
        intent: DAWN_OPINION_LIST_INTENT,
        brief: `Dawn Opinion list (${dawnItems.length})`,
        items: asQueryItems,
        total: dawnItems.length,
        whatsappText,
        sourceButtons,
        usedMemory: true,
        lastUpdated: now,
      }),
    );
  }

  if (dawnMenuPending && !otherOutletAsk && !isDawnOpinionListAsk(incomingQ)) {
    const menuSources = dawnMenuSourcesFromState(
      convStateEarly,
      (resolved.lastSources || activeTopic?.lastSources || []) as StoredSource[],
    );
    const pickIdx = parseDawnOpinionSelection(incomingQ, menuSources);
    if (pickIdx != null && menuSources[pickIdx]) {
      const chosen = menuSources[pickIdx];
      const dawnItem: DawnOpinionItem = {
        title: chosen.title,
        url: chosen.url,
        source: chosen.source || 'Dawn',
        publishedAt: chosen.publishedAt,
        body: chosen.body,
      };
      const brief = buildDawnOpinionPickBrief(dawnItem, replyLang);
      const asItem: QueryResultItem = {
        id: 'dawn-op-pick',
        title: dawnItem.title,
        description: dawnItem.body || '',
        url: dawnItem.url,
        source: dawnItem.source,
        category: 'global',
        publishedAt: dawnItem.publishedAt || now,
        significance: 50,
        tags: ['opinion'],
        matchScore: 50,
        score: 50,
        matchedTerms: ['dawn', 'opinion'],
      };
      const displayUrl = await shortenArticleUrl(dawnItem.url);
      const sourceButtons = buildSourceButtons([asItem], [displayUrl]);
      const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
      const sourcesLabel = replyLang === 'ur' ? '*ذرائع:*' : '*Sources*';
      const whatsappText = [
        '*NewsDash Analyst*',
        '',
        `${topicKey} Dawn Opinion`,
        '',
        brief,
        '',
        sourcesLabel,
        formatSourceLine(asItem, 0, false, displayUrl),
      ].join('\n');
      await remember(
        'Dawn Opinion',
        'news',
        dawnItem.title.slice(0, 120),
        whatsappText,
        [dawnItem.url],
        { answer: brief, sources: [chosen] },
      );
      setGroundingPath(requestId, 'none', 'dawn_opinion_pick');
      return Response.json(
        withPaths({
          query: q,
          rawQuery: incomingQ,
          displayTopic: 'Dawn Opinion',
          intent: 'news',
          brief: dawnItem.title,
          items: [asItem],
          total: 1,
          whatsappText,
          sourceButtons,
          usedMemory: true,
          lastUpdated: now,
        }),
      );
    }
    if (looksLikeDawnPickAttempt(incomingQ)) {
      setGroundingPath(requestId, 'none', 'dawn_opinion_pick_clarify');
      return Response.json(
        withPaths({
          query: q,
          rawQuery: incomingQ,
          displayTopic: 'Dawn Opinion',
          intent: DAWN_OPINION_LIST_INTENT,
          brief: 'Need number or title for Dawn pick',
          items: [],
          total: 0,
          whatsappText: buildDawnOpinionPickClarify(replyLang),
          usedMemory: true,
          lastUpdated: now,
        }),
      );
    }
  }

  // ── Evidence-based follow-ups ──
  // "explain it in Urdu" / "explain more" must reuse the PREVIOUS answer's
  // stored evidence, not re-run retrieval (which drifts to other articles).
  // Evidence belongs to the conversation, regardless of which live-data or
  // news plugin produced it.
  const evidenceSources = resolved.lastSources || [];
  const hasGroundedEvidence = evidenceSources.length > 0;
  const threadIntent = resolved.memoryIntent || plugin.kind;

  if (resolved.followUpKind === 'translate' && resolved.lastAnswer) {
    // Keep the prior news topic — never title the reply after "isy urdu mai".
    const priorTopic =
      (convStateEarly?.activeTopicId &&
        convStateEarly.topics.find((t) => t.id === convStateEarly.activeTopicId)?.label) ||
      convStateEarly?.topics[0]?.label ||
      topicLabel;
    const answerIsUrdu = ((resolved.lastAnswer.match(/[\u0600-\u06FF]/g) || []).length || 0) >= 80;
    const alreadyTarget = (replyLang === 'ur') === answerIsUrdu;
    let translated: string | null = alreadyTarget ? resolved.lastAnswer : null;

    // Always try a direct translation of the stored answer first — same facts,
    // no new retrieval. Then fall back to re-grounding from stored sources.
    if (!translated && !alreadyTarget) {
      translated = await translateAnswerText(resolved.lastAnswer, replyLang);
    }

    if ((!translated || (replyLang === 'ur' && ((translated.match(/[\u0600-\u06FF]/g) || []).length < 40))) && hasGroundedEvidence) {
      const bodies = await resolveArticleBodies(
        evidenceSources.map((s) => ({ url: s.url, description: s.body || '', title: s.title })),
      );
      const sources: GroundedSource[] = evidenceSources.map((s, i) => ({
        title: s.title,
        source: s.source,
        url: s.url,
        publishedAt: s.publishedAt,
        body: bodies[i] || s.body || s.title,
      }));
      const rebuilt = await buildGroundedAnswer(
        replyLang === 'ur'
          ? 'ان ذرائع کی بنیاد پر پچھلے جواب کا مکمل اردو خلاصہ لکھو۔ ہر جملہ اردو رسم الخط میں ہو۔ لفظ دہراؤ مت۔'
          : 'Faithfully restate the prior answer from these sources in English.',
        sources,
        replyLang,
      );
      if (rebuilt && !isDegenerateRepetition(rebuilt)) {
        const ur = (rebuilt.match(/[\u0600-\u06FF]/g) || []).length;
        if (replyLang !== 'ur' || ur >= 40) translated = rebuilt;
        else {
          const forced = await translateAnswerText(rebuilt, 'ur');
          if (forced && !isDegenerateRepetition(forced)) translated = forced;
        }
      }
    }

    if (translated && isDegenerateRepetition(translated)) {
      translated = null;
    }

    if (!translated) {
      // Honest fallback: keep English prior answer rather than a broken Urdu loop.
      translated =
        replyLang === 'ur'
          ? `${resolved.lastAnswer}\n\n_(Urdu translation failed — showing the previous English answer.)_`
          : resolved.lastAnswer;
    }
    const srcItems = evidenceSources as unknown as QueryResultItem[];
    const displayUrls = hasGroundedEvidence
      ? await Promise.all(evidenceSources.map((s) => shortenArticleUrl(s.url)))
      : [];
    const sourceButtons = hasGroundedEvidence ? buildSourceButtons(srcItems, displayUrls) : [];
    const bodyUrduChars = (translated.match(/[\u0600-\u06FF]/g) || []).length;
    const labelLang: 'en' | 'ur' =
      replyLang === 'ur' && bodyUrduChars >= 40
        ? 'ur'
        : replyLang === 'en' && bodyUrduChars < 20
          ? 'en'
          : bodyUrduChars >= 40
            ? 'ur'
            : 'en';
    const translateFailed = replyLang === 'ur' && labelLang !== 'ur';
    const topicKey = labelLang === 'ur' ? '*موضوع:*' : '*Topic:*';
    const aLabel = labelLang === 'ur' ? '*جواب:*' : '*Answer:*';
    const sLabel = labelLang === 'ur' ? '*ذرائع:*' : '*Sources*';
    const showIndex = evidenceSources.length > 1;
    const whatsappText = [
      '*NewsDash Analyst*',
      '',
      `${topicKey} ${priorTopic}`,
      '',
      aLabel,
      translated,
      ...(hasGroundedEvidence
        ? [
            '',
            sLabel,
            srcItems.map((i, idx) => formatSourceLine(i, idx, showIndex, displayUrls[idx])).join('\n\n'),
          ]
        : []),
    ].join('\n');
    // Keep the ORIGINAL answer as evidence so "now in English" after
    // "in Urdu" restores it losslessly without another translation.
    await remember(priorTopic, threadIntent, translated.split(/[.!?۔]/)[0].trim().slice(0, 200), translated, undefined, {
      answer: resolved.lastAnswer,
      sources: evidenceSources,
    });
    setGroundingPath(requestId, 'none', translateFailed ? 'translate_failed_kept_en' : 'translate_reuse');
    return Response.json(withPaths({
      query: q,
      rawQuery: incomingQ,
      effectiveQuery: rawQ,
      displayTopic: priorTopic,
      intent: threadIntent,
      followUpKind: 'translate',
      brief: translated.slice(0, 200),
      items: [],
      total: evidenceSources.length,
      whatsappText,
      sourceButtons,
      usedMemory: true,
      memoryBackend: getRedisClient() ? 'redis' : 'in-process',
      lastUpdated: now,
    }));
  }

  // Elaborate only on prior grounded evidence — skip if the stored answer was
  // a thin extractive fallback (starts with publisher dump only and no LLM brief).
  if (
    resolved.followUpKind === 'elaborate' &&
    hasGroundedEvidence &&
    resolved.lastAnswer &&
    !/^According to [^:]+:\s*\S+\s+According to /i.test(resolved.lastAnswer.trim())
  ) {
    // Fetch fuller article bodies so the answer can actually go deeper.
    const bodies = await resolveArticleBodies(
      evidenceSources.map((s) => ({ url: s.url, description: s.body || '', title: s.title })),
    );
    const sources: GroundedSource[] = evidenceSources.map((s, i) => ({
      title: s.title,
      source: s.source,
      url: s.url,
      publishedAt: s.publishedAt,
      body: bodies[i] || s.body || s.title,
    }));
    const question = resolved.followUpText || incomingQ;
    let answer = await buildGroundedAnswer(question, sources, replyLang, undefined, {
      previousAnswer: resolved.lastAnswer,
      focusAsk: incomingQ,
      needTag: inferNeedTag(question),
      rollingSummary: resolved.rollingSummary,
    });
    let elaborateGrounded = true;
    let elaborateLabelLang: 'en' | 'ur' = replyLang;
    if (!answer || answer.length < WA_ANSWER_MIN) {
      const verified = buildExtractiveAnswer(question, sources, 'en');
      answer = `The available verified coverage does not establish a direct answer to “${question.slice(0, 120)}.” Relevant facts:\n\n${verified}`;
      elaborateGrounded = false;
      elaborateLabelLang = 'en';
    }
    const srcItems = evidenceSources as unknown as QueryResultItem[];
    const displayUrls = await Promise.all(evidenceSources.map((s) => shortenArticleUrl(s.url)));
    const sourceButtons = buildSourceButtons(srcItems, displayUrls);
    const topicKey = elaborateLabelLang === 'ur' ? '*موضوع:*' : '*Topic:*';
    const aLabel = elaborateLabelLang === 'ur' ? '*جواب:*' : '*Answer:*';
    const sLabel = elaborateLabelLang === 'ur' ? '*ذرائع:*' : '*Sources*';
    const showIndex = evidenceSources.length > 1;
    const whatsappText = [
      '*NewsDash Analyst*',
      '',
      `${topicKey} ${topicLabel}`,
      '',
      aLabel,
      answer,
      '',
      sLabel,
      srcItems.map((i, idx) => formatSourceLine(i, idx, showIndex, displayUrls[idx])).join('\n\n'),
    ].join('\n');
    // A fallback ("does not establish…") reply must not replace the original
    // grounded evidence; keep the previous answer/sources for later follow-ups.
    await remember(
      topicLabel,
      threadIntent,
      answer.split(/[.!?۔]/)[0].trim().slice(0, 200),
      answer,
      undefined,
      elaborateGrounded ? { answer, sources: evidenceSources } : undefined,
    );
    timer.mark('evidence_reuse');
    const ragMetrics = timer.snapshot({
      candidateCount: sources.length,
      vectorHit: false,
      fallbackReason: 'memory_evidence',
      needTag: inferNeedTag(question),
    });
    setGroundingPath(
      requestId,
      elaborateGrounded ? 'llm' : 'extractive',
      elaborateGrounded ? undefined : 'elaborate_extractive',
    );
    return Response.json(
      withPaths({
        query: q,
        rawQuery: incomingQ,
        effectiveQuery: rawQ,
        displayTopic: topicLabel,
        intent: threadIntent,
        followUpKind: 'elaborate',
        brief: answer.slice(0, 200),
        items: [],
        total: evidenceSources.length,
        whatsappText,
        sourceButtons,
        usedMemory: true,
        memoryBackend: getRedisClient() ? 'redis' : 'in-process',
        claimSources: mapClaimsToSources(answer, sources),
        ragMetrics,
        lastUpdated: now,
      }),
    );
  }

  if (plugin.kind === 'greeting') {
    setGroundingPath(requestId, 'none', 'greeting');
    return Response.json(
      withPaths({
        query: q,
        rawQuery: incomingQ,
        displayTopic: topicLabel,
        intent: 'greeting',
        brief: 'Greeting',
        items: [],
        total: 0,
        whatsappText: buildGreeting(replyLang, incomingQ),
        usedMemory: resolved.usedMemory || turnClass?.kind === 'continue_topic' || Boolean(classifiedTopicId),
        lastUpdated: now,
      }),
    );
  }

  if (plugin.kind === 'weather') {
    const cities = splitWeatherCities(plugin.city);
    const cityList = cities.length ? cities : plugin.cityAsked && plugin.city.trim() ? [plugin.city] : [];

    // Bare "weather" / "mosam" with no city — ask instead of inventing Karachi/London.
    if (!cityList.length) {
      const whatsappText = buildWeatherCityClarify(replyLang);
      await remember('Weather', 'weather', 'Need city for weather', whatsappText);
      setGroundingPath(requestId, 'none', 'weather_need_city');
      return Response.json(
        withPaths({
          query: q,
          rawQuery: incomingQ,
          displayTopic: 'Weather',
          intent: 'weather',
          brief: 'Need a city name for weather',
          items: [],
          total: 0,
          whatsappText,
          usedMemory: resolved.usedMemory || turnClass?.kind === 'continue_topic' || Boolean(classifiedTopicId),
          lastUpdated: now,
        }),
      );
    }

    const weatherRows = await Promise.all(
      cityList.map((city) => fetchWeather(city, true)),
    );
    const rows = weatherRows.map((w, i) => w || {
      error: `Could not fetch live weather for ${cityList[i]}.`,
      requestedCity: cityList[i],
    });
    const okRows = rows.filter((w) => !w.error);
    let whatsappText = buildMultiWeatherReply(topicLabel, rows, replyLang);
    const primary = okRows[0] || rows[0];
    const gate = assertQuality({
      kind: 'weather',
      text: whatsappText,
      weather: primary,
      requestedCity: plugin.cityAsked && cityList.length === 1 ? cityList[0] : undefined,
    });
    if (!gate.ok && okRows.length === 0) {
      const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
      whatsappText =
        replyLang === 'ur'
          ? [
              '*NewsDash Analyst*',
              '',
              `${topicKey} ${localizedTopicLabel(topicLabel, replyLang)}`,
              'موسم ابھی دستیاب نہیں۔ واضح شہر نام لکھیں (مثلاً Karachi weather)۔',
            ].join('\n')
          : [
              '*NewsDash Analyst*',
              '',
              `${topicKey} ${topicLabel}`,
              'Live weather is not available right now. Try a clearer city name (e.g. "Karachi weather").',
            ].join('\n');
    }
    const brief =
      okRows.length > 1
        ? `Live weather for ${okRows.map((w) => w.location).join(', ')}.`
        : primary.error || `Live conditions for ${primary.location || topicLabel}.`;
    await remember(topicLabel, 'weather', brief, whatsappText);
    setGroundingPath(requestId, 'none', 'live_weather');
    return Response.json(
      withPaths({
        query: q,
        rawQuery: incomingQ,
        displayTopic: topicLabel,
        intent: 'weather',
        weather: primary ?? undefined,
        brief,
        items: [],
        total: okRows.length,
        whatsappText,
        usedMemory: resolved.usedMemory || turnClass?.kind === 'continue_topic' || Boolean(classifiedTopicId),
        lastUpdated: now,
      }),
    );
  }

  if (plugin.kind === 'gold_price' && isSimplePriceCheck(incomingQ)) {
    const gold = await fetchGold();
    if (gold) {
      let whatsappText = buildGoldReply(topicLabel, gold, replyLang);
      const gate = assertQuality({ kind: 'gold_price', text: whatsappText, gold });
      if (!gate.ok) {
        const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
        whatsappText = ['*NewsDash Analyst*', '', `${topicKey} ${localizedTopicLabel(topicLabel, replyLang)}`, gate.reason].join('\n');
      }
      await remember(topicLabel, 'gold_price', `Gold $${gold.price}/oz`, whatsappText);
      setGroundingPath(requestId, 'none', 'live_quote');
      return Response.json(withPaths({
        query: q,
        rawQuery: incomingQ,
        displayTopic: topicLabel,
        intent: 'gold_price',
        brief: 'Live gold spot (international).',
        items: [],
        total: 1,
        goldPrice: gold,
        whatsappText,
        usedMemory: resolved.usedMemory || turnClass?.kind === 'continue_topic' || Boolean(classifiedTopicId),
        lastUpdated: now,
      }));
    }
    // Fall through to universal news if live quote fails.
  }

  if (plugin.kind === 'crypto_price' && isSimplePriceCheck(incomingQ)) {
    const quote = await fetchCrypto(plugin.cryptoId, true);
    if (quote) {
      let whatsappText = buildCryptoReply(topicLabel, quote, replyLang);
      const gate = assertQuality({ kind: 'crypto_price', text: whatsappText, crypto: quote });
      if (!gate.ok) {
        const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
        whatsappText = ['*NewsDash Analyst*', '', `${topicKey} ${localizedTopicLabel(topicLabel, replyLang)}`, gate.reason].join('\n');
      }
      await remember(topicLabel, 'crypto_price', `${quote.symbol} $${quote.usd}`, whatsappText);
      setGroundingPath(requestId, 'none', 'live_quote');
      return Response.json(withPaths({
        query: q,
        rawQuery: incomingQ,
        displayTopic: topicLabel,
        intent: 'crypto_price',
        brief: `Live ${quote.name} price.`,
        items: [],
        total: 1,
        cryptoPrice: quote,
        whatsappText,
        usedMemory: resolved.usedMemory || turnClass?.kind === 'continue_topic' || Boolean(classifiedTopicId),
        lastUpdated: now,
      }));
    }
  }

  if (plugin.kind === 'fuel_price' && isSimplePriceCheck(incomingQ)) {
    // Petrol/diesel asks → Pakistan pump PKR/litre (NOT WTI/Brent barrels).
    if (wantsPakistanPumpFuel(`${incomingQ} ${q}`)) {
      const pkFuel = await fetchPakistanFuelPrices();
      if (pkFuel && (pkFuel.petrolPkr > 0 || pkFuel.dieselPkr > 0)) {
        const products = requestedPumpProducts(incomingQ);
        const displayLinks = await Promise.all(
          pkFuel.verifyUrls.map(async (v) => ({
            label: v.label,
            url: await shortenArticleUrl(v.url),
          })),
        );
        const whatsappText = buildPakistanFuelReply(pkFuel, replyLang, displayLinks, products);
        const sourceButtons: SourceButton[] = displayLinks.map((v) => ({
          type: 'url',
          text: v.label.slice(0, 20),
          url: v.url,
        }));
        const briefParts = [
          products.petrol && pkFuel.petrolPkr > 0 ? `Petrol Rs ${pkFuel.petrolPkr}/L` : '',
          products.diesel && pkFuel.dieselPkr > 0 ? `Diesel Rs ${pkFuel.dieselPkr}/L` : '',
        ].filter(Boolean);
        await remember(
          products.petrol && products.diesel
            ? 'Pakistan petrol / diesel'
            : products.diesel
              ? 'Pakistan diesel'
              : 'Pakistan petrol',
          'fuel_price',
          briefParts.join(' · '),
          whatsappText,
        );
        setGroundingPath(requestId, 'none', 'pk_pump_fuel');
        return Response.json(
          withPaths({
            query: q,
            rawQuery: incomingQ,
            displayTopic:
              products.petrol && products.diesel
                ? 'Pakistan petrol / diesel'
                : products.diesel
                  ? 'Pakistan diesel'
                  : 'Pakistan petrol',
            intent: 'fuel_price',
            brief: briefParts.join(', '),
            items: [],
            total: 1,
            whatsappText,
            sourceButtons,
            usedMemory: resolved.usedMemory || turnClass?.kind === 'continue_topic' || Boolean(classifiedTopicId),
            lastUpdated: now,
          }),
        );
      }
      // If PK pump feed fails, fall through to news — do NOT show crude as "petrol price".
    } else {
      const oil = await fetchOil();
      if (oil) {
        let whatsappText = buildFuelReply(topicLabel, oil, replyLang);
        const gate = assertQuality({ kind: 'fuel_price', text: whatsappText, oil });
        if (!gate.ok) {
          const topicKey = replyLang === 'ur' ? '*موضوع:*' : '*Topic:*';
          whatsappText = ['*NewsDash Analyst*', '', `${topicKey} ${localizedTopicLabel(topicLabel, replyLang)}`, gate.reason].join('\n');
        }
        await remember(
          topicLabel,
          'fuel_price',
          `WTI $${oil.wtiUsd}${oil.brentUsd ? ` / Brent $${oil.brentUsd}` : ''}`,
          whatsappText,
        );
        setGroundingPath(requestId, 'none', 'live_quote');
        return Response.json(
          withPaths({
            query: q,
            rawQuery: incomingQ,
            displayTopic: topicLabel,
            intent: 'fuel_price',
            brief: 'Live crude oil (WTI/Brent).',
            items: [],
            total: 1,
            oilPrice: oil,
            whatsappText,
            usedMemory: resolved.usedMemory || turnClass?.kind === 'continue_topic' || Boolean(classifiedTopicId),
            lastUpdated: now,
          }),
        );
      }
    }
    // Fall through to oil/fuel-news path if live quote fails.
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
  // Scan the user's words only — resolved `q` may still carry sticky fuel hints.
  const fuelAsk =
    plugin.kind === 'fuel_price' ||
    /\b(petrol|diesel|gasoline|pump\s*price|fuel\s*price)\b/i.test(incomingQ) ||
    /پیٹرول|ڈیزل|پیٹرولیم|ایندھن/.test(incomingQ);

  // Smart rewrite is topic-agnostic. Keep the stable thread topic and the
  // literal follow-up separate so causal/outlook/comparison meaning survives.
  const semanticQuestion = resolved.followUpText
    ? `Topic: ${q}. Question: ${resolved.followUpText}`
    : rawQ;
  const [plan, urduHints] = await Promise.all([
    planNewsQuery(semanticQuestion),
    englishSearchHints(rawQ, replyLang),
  ]);
  let baseSearch = plan?.searchQuery || urduHints || newsQ;
  if (fuelAsk) {
    // Pakistan pump / OGRA petrol-diesel news — not generic WTI barrel headlines.
    baseSearch = wantsPakistanPumpFuel(`${incomingQ} ${q}`)
      ? `${plan?.searchQuery || 'pakistan petrol diesel'} pakistan petrol diesel OGRA fuel price litre`
      : `${plan?.searchQuery || 'oil crude petroleum fuel gasoline'} oil crude petroleum fuel opec diesel`;
  }

  // Professional domain auto-detection: pin category + override search for precision.
  // Prefer the *user's* words so a prior Dawn thread cannot force Dawn mustMatch onto "bbc news today".
  const domainHint =
    plugin.kind === 'news' && !fuelAsk
      ? detectDomainHint(incomingQ) ||
        (isVagueFollowUp(incomingQ) ? detectDomainHint(rawQ) : null)
      : null;
  let pinnedCategories: string[] | undefined = body.categories?.length ? body.categories : undefined;
  if (domainHint) {
    baseSearch = domainHint.searchOverride;
    pinnedCategories = [domainHint.category] as string[];
  }

  const preferFresh =
    plan?.preferFreshHours ??
    (/\b(today|latest|now|breaking|just\s+in|aaj)\b/i.test(rawQ)
      ? 24
      : /\b(recent|recently|this week|new)\b/i.test(rawQ)
        ? 72
        : null);

  const newsTopicLabel =
    classifiedDisplayLabel ||
    domainHint?.topicLabel ||
    (plugin.kind === 'news' && plan?.displayTopic
      ? plan.displayTopic
      : topicLabel);

  // Exclude already-shown stories whenever we are NOT deepening/translating
  // the same evidence — including "more", near-duplicate re-asks, and same-topic continues.
  const excludeUrls =
    resolved.followUpKind !== 'elaborate' &&
    resolved.followUpKind !== 'translate' &&
    resolved.shownUrls?.length
      ? new Set(resolved.shownUrls)
      : undefined;

  const ranked = await retrieveAndRank(
    baseSearch,
    Math.min(Math.max(limit * 3, limit), 9),
    pinnedCategories as import('@/types').Category[] | undefined,
    preferFresh,
    { excludeUrls, mustMatch: domainHint?.mustMatch },
  );
  timer.mark('lexical_retrieve');

  // Hybrid RAG: dense+sparse Upstash Vector fused with lexical candidates.
  const answerQuestion = resolved.followUpText || incomingQ;
  const hybridQuery = `${baseSearch} ${answerQuestion}`.trim();
  let vectorHit = false;
  let needTag: RagNeedTag | undefined;
  let fallbackReason: string | undefined;
  try {
    const hybrid = await hybridRetrieve(hybridQuery, {
      categories: pinnedCategories as import('@/types').Category[] | undefined,
      preferFreshHours: preferFresh,
      excludeUrls,
      mustMatch: domainHint?.mustMatch,
      topK: 16,
    });
    vectorHit = hybrid.vectorHit;
    needTag = hybrid.needTag;
    if (hybrid.hits.length) {
      const fused = fuseHybridAndLexical(hybrid.hits, ranked.items, limit, preferFresh);
      if (fused.length) {
        ranked.items = fused.map((i) => ({
          ...i,
          score: i.score,
          matchScore: i.matchScore,
          matchedTerms: i.matchedTerms,
        })) as QueryResultItem[];
        ranked.total = Math.max(ranked.total, fused.length);
      }
    } else if (isVectorConfigured()) {
      fallbackReason = 'vector_empty';
    } else {
      fallbackReason = 'vector_unconfigured';
    }
  } catch (err) {
    fallbackReason = 'vector_error';
    console.warn('[query] hybrid retrieve failed', err);
  }
  timer.mark('hybrid_retrieve');

  let items = ranked.items;
  if (plugin.kind === 'gold_price') {
    items = items.filter((i) => isAssetStory(i, 'gold'));
  } else if (plugin.kind === 'crypto_price') {
    items = items.filter((i) => isAssetStory(i, 'crypto', plugin.cryptoId));
  }
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

  // Final relevance gate: keep only evidence that answers the information need.
  // This LLM judge is the authority — lexical usedLatestFallback is only a hint.
  if (items.length) {
    const selected = await selectRelevantCandidateIndexes(
      answerQuestion,
      items.map((item) => ({
        title: item.title,
        description: item.description,
        source: item.source,
      })),
      limit,
    );
    if (selected) {
      if (selected.length) {
        items = selected.map((index) => items[index]).filter(Boolean);
        // Judge accepted on-theme articles → allow conversational grounding.
        ranked.usedLatestFallback = false;
        fallbackReason = fallbackReason === 'relevance_gate_empty' ? undefined : fallbackReason;
      } else if (plugin.kind === 'news') {
        ranked.usedLatestFallback = true;
        items = items.slice(0, limit);
        fallbackReason = fallbackReason || 'relevance_gate_empty';
      } else {
        // Live-data domains can still answer with their current quote without
        // pretending unrelated topical coverage explains the user's question.
        items = [];
        fallbackReason = fallbackReason || 'relevance_gate_empty_live';
      }
    } else {
      // Judge unavailable (quota/key) — keep candidates. Soft lexical veto must
      // not block grounding when domain/hybrid already found a pool.
      items = items.slice(0, limit);
      if (vectorHit || domainHint || questionLooksAbstract(answerQuestion)) {
        ranked.usedLatestFallback = false;
      }
    }
  }
  timer.mark('relevance_gate');

  const note = fuelAsk
    ? replyLang === 'ur'
      ? 'نوٹ: متعلقہ ایندھن/تیل کوریج۔ لائیو پمپ ریٹ کے لیے "petrol price" یا "diesel price" پوچھیں۔'
      : 'Note: related fuel/oil coverage. For live pump rates, ask "petrol price" or "diesel price".'
    : undefined;

  const combinedHistory: Array<{ role?: string; text?: string; content?: string }> = [];
  if (resolved.turns) {
    for (const t of resolved.turns) {
      combinedHistory.push({ role: t.role, content: t.text });
    }
  }
  for (const t of history) {
    const role = t.role || 'user';
    const text = t.content || t.text || '';
    if (text) {
      combinedHistory.push({ role, content: text });
    }
  }

  let liveQuoteText: string | undefined;
  if (plugin.kind === 'gold_price') {
    const gold = await fetchGold();
    if (gold) {
      liveQuoteText = replyLang === 'ur'
        ? `لائیو سونے کی قیمت: XAU/USD $${gold.price.toLocaleString('en-US')} / oz` + (gold.pkrPerTolaApprox ? `، تخمینہ Rs ${gold.pkrPerTolaApprox.toLocaleString('en-PK')} / تولہ` : '')
        : `Live gold spot price: XAU/USD is $${gold.price.toLocaleString('en-US')} / oz` + (gold.pkrPerTolaApprox ? `, approx Rs ${gold.pkrPerTolaApprox.toLocaleString('en-PK')} / tola` : '');
    }
  } else if (plugin.kind === 'crypto_price') {
    const quote = await fetchCrypto(plugin.cryptoId, true);
    if (quote) {
      const changeStr = quote.change24h != null ? ` (${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}% in 24h)` : '';
      liveQuoteText = replyLang === 'ur'
        ? `لائیو ${quote.name} قیمت: $${quote.usd.toLocaleString('en-US')}${changeStr}` + (quote.pkrApprox ? `، تخمینہ Rs ${quote.pkrApprox.toLocaleString('en-PK')}` : '')
        : `Live ${quote.name} price: $${quote.usd.toLocaleString('en-US')}${changeStr}` + (quote.pkrApprox ? `, approx Rs ${quote.pkrApprox.toLocaleString('en-PK')}` : '');
    }
  } else if (plugin.kind === 'fuel_price') {
    // Never prepend petrol/diesel prices into news replies — price cards are returned earlier.
    // Leaving liveQuoteText unset avoids polluting every fuel-related news answer.
  }

  const built = await buildNewsReply(
    resolved.followUpText || incomingQ,
    newsTopicLabel,
    items,
    ranked.poolSize,
    note,
    Boolean(ranked.usedLatestFallback),
    replyLang,
    combinedHistory,
    liveQuoteText,
    needTag,
    resolved.rollingSummary,
  );
  let whatsappText = built.text;
  let finalAnswer = built.answer;
  let finalGrounded = built.grounded;
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
    console.warn('[quality_gate] fallback_triggered', {
      chatId,
      reason: gate.reason,
      query: rawQ,
      requestId,
    });
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
    finalAnswer = fallbackAnswer;
    finalGrounded = false;
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

  const savedIntent =
    fuelAsk ? 'fuel_price'
    : plugin.kind === 'gold_price' ? 'gold_price'
    : plugin.kind === 'crypto_price' ? 'crypto_price'
    : 'news';
  const answerBrief = (finalAnswer || note || newsTopicLabel).split(/[.!?]/)[0].trim().slice(0, 200);
  // Persist answer text always (for translate). Persist article sources whenever
  // we have real feed items so "say that in Urdu" can rebuild without a fresh
  // search — even if the LLM path fell back to extractive.
  const appOrigin = getPublicAppUrl();
  const evidence =
    finalAnswer &&
    !ranked.usedLatestFallback &&
    (built.sources.some((s) => s.url !== appOrigin) || items.length > 0)
      ? {
          answer: finalAnswer,
          sources: (
            built.sources.some((s) => s.url !== appOrigin)
              ? built.sources
              : items.map((i) => ({
                  title: i.title,
                  source: i.source || 'Publisher',
                  url: i.url,
                  publishedAt: i.publishedAt,
                  body: i.description || i.title,
                }))
          )
            .filter((s) => s.url !== appOrigin)
            .slice(0, 3)
            .map((s) => ({
              title: s.title,
              source: s.source,
              url: s.url,
              publishedAt: s.publishedAt,
              body: (s.body || '').slice(0, 2000),
            })),
        }
      : undefined;
  await remember(
    newsTopicLabel,
    savedIntent,
    answerBrief,
    finalAnswer || note || newsTopicLabel,
    items.map((i) => i.url).filter(isValidArticleUrl),
    evidence,
  );
  const ragMetrics = timer.snapshot({
    candidateCount: items.length,
    vectorHit,
    fallbackReason,
    needTag,
  });
  return Response.json(withPaths({
    query: q,
    rawQuery: incomingQ,
    effectiveQuery: rawQ,
    displayTopic: newsTopicLabel,
    intent: savedIntent,
    terms: { primary: ranked.tokens, expanded: ranked.expanded },
    brief: finalAnswer || note || (items.length ? 'Matching stories from NewsDash.' : 'No strong match.'),
    items,
    total: ranked.total,
    poolSize: ranked.poolSize,
    whatsappText,
    sourceButtons,
    linkPreview: preview,
    linkPreviewEnabled: true,
    usedMemory: resolved.usedMemory || turnClass?.kind === 'continue_topic' || Boolean(classifiedTopicId),
    memoryBackend: getRedisClient() ? 'redis' : 'in-process',
    retrieval: {
      mode: vectorHit ? 'hybrid' : 'lexical',
      vectorConfigured: isVectorConfigured(),
      needTag,
      fallbackReason,
    },
    ragMetrics,
    claimSources: mapClaimsToSources(finalAnswer, built.sources),
    lastUpdated: now,
  }));
}
