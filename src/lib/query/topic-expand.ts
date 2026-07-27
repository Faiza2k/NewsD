/**
 * Concept → headline vocabulary expansions.
 * Used as a recall booster for abstract topic asks ("macroeconomic", "new tech"),
 * never as the sole source of intelligence — hybrid retrieval + LLM judge decide.
 */

/** Tokens that name a broad theme rather than a concrete entity/event. */
const ABSTRACT_TOPIC_TOKENS = new Set([
  'macro',
  'macroeconomic',
  'macroeconomics',
  'economy',
  'economic',
  'economics',
  'financial',
  'finance',
  'technology',
  'technologies',
  'tech',
  'innovation',
  'innovations',
  'geopolitics',
  'geopolitical',
  'politics',
  'political',
  'markets',
  'market',
]);

/** Abstract token → words that actually appear in RSS headlines. */
const TOPIC_EXPANSIONS: Record<string, string[]> = {
  macro: [
    'inflation',
    'gdp',
    'recession',
    'tariff',
    'trade',
    'fed',
    'rates',
    'central',
    'bank',
    'monetary',
    'fiscal',
    'employment',
    'jobs',
    'pmi',
    'markets',
  ],
  macroeconomic: [
    'inflation',
    'gdp',
    'recession',
    'tariff',
    'trade',
    'fed',
    'rates',
    'central',
    'bank',
    'monetary',
    'fiscal',
    'employment',
    'economy',
    'markets',
  ],
  macroeconomics: [
    'inflation',
    'gdp',
    'recession',
    'tariff',
    'trade',
    'fed',
    'rates',
    'central',
    'bank',
    'economy',
    'markets',
  ],
  economy: ['economic', 'inflation', 'gdp', 'recession', 'growth', 'markets', 'trade', 'jobs'],
  economic: ['economy', 'inflation', 'gdp', 'recession', 'growth', 'markets', 'trade', 'jobs'],
  economics: ['economy', 'economic', 'inflation', 'gdp', 'markets'],
  financial: ['finance', 'markets', 'stocks', 'bonds', 'banks', 'credit'],
  finance: ['financial', 'markets', 'stocks', 'bonds', 'banks'],
  technology: ['tech', 'ai', 'software', 'chip', 'semiconductor', 'startup', 'digital'],
  technologies: ['tech', 'ai', 'software', 'chip', 'semiconductor', 'startup', 'digital'],
  tech: ['technology', 'ai', 'software', 'chip', 'startup'],
  innovation: ['ai', 'startup', 'research', 'breakthrough', 'launch', 'product'],
  innovations: ['ai', 'startup', 'research', 'breakthrough', 'launch'],
  geopolitics: ['war', 'conflict', 'sanctions', 'diplomacy', 'military', 'strike'],
  geopolitical: ['war', 'conflict', 'sanctions', 'diplomacy', 'military', 'strike'],
  politics: ['government', 'election', 'policy', 'parliament', 'minister'],
  political: ['government', 'election', 'policy', 'parliament'],
  markets: ['stocks', 'shares', 'equities', 'bonds', 'trading', 'wall'],
  market: ['stocks', 'shares', 'equities', 'bonds', 'trading'],
};

export function isAbstractTopicToken(token: string): boolean {
  return ABSTRACT_TOPIC_TOKENS.has(String(token || '').toLowerCase());
}

/** True when every meaningful token is an abstract theme word (no concrete entity). */
export function isAbstractTopicAsk(tokens: string[]): boolean {
  const meaningful = tokens.map((t) => t.toLowerCase()).filter((t) => t.length >= 4);
  if (!meaningful.length) return false;
  return meaningful.every((t) => isAbstractTopicToken(t));
}

/** Expand tokens with concept vocabulary for recall (deduped). */
export function expandTopicTokens(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const raw of tokens) {
    const t = String(raw || '').toLowerCase().trim();
    if (!t) continue;
    out.add(t);
    const extra = TOPIC_EXPANSIONS[t];
    if (extra) for (const e of extra) out.add(e);
  }
  return [...out];
}

/**
 * For hybrid absolute gates: keep original topical tokens and add expansions
 * so abstract asks ("macroeconomic") can match real headlines ("tariff", "fed").
 */
export function expandTopicQueryTokens(tokens: string[]): string[] {
  return expandTopicTokens(tokens).filter((t) => t.length >= 3).slice(0, 40);
}

const ABSTRACT_ASK_RE =
  /\b(macro(?:economic|economics)?|econom(?:y|ic|ics)|financ(?:e|ial)|geopolitic(?:s|al)?|innovations?|technologies?)\b/i;

/** Fast regex check on the raw user question. */
export function questionLooksAbstract(q: string): boolean {
  return ABSTRACT_ASK_RE.test(String(q || ''));
}
