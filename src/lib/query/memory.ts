import { groqChat } from '@/lib/groq';
import type { ReplyLanguage } from '@/lib/query/grounded-answer';
import { getRedisClient } from '@/lib/kv/redis';

export type MemoryTurn = {
  role: 'user' | 'assistant';
  text: string;
  at: number;
};

export type ChatMemory = {
  lastQ: string;
  lastTopic: string;
  lastIntent?: string;
  lastEntities?: string[];
  lastAnswerBrief?: string;
  preferredLang?: ReplyLanguage;
  /** Article URLs already sent to this chat — used to avoid repeating the same stories on "more". */
  shownUrls?: string[];
  turns: MemoryTurn[];
  updatedAt: number;
};

export type HistoryTurn = {
  role?: string;
  content?: string;
  text?: string;
};

const TTL_MS = 45 * 60 * 1000; // 45 minutes
const MAX_TURNS = 8;

const globalStore = globalThis as typeof globalThis & {
  __newsdashChatMemory?: Map<string, ChatMemory>;
};

/** Map known LID aliases ↔ phone JIDs so memory stays on one key. */
const CHAT_ALIASES: Record<string, string> = {
  '193277873631353@lid': '923138308265@c.us',
  '923138308265@c.us': '923138308265@c.us',
};

function store(): Map<string, ChatMemory> {
  if (!globalStore.__newsdashChatMemory) {
    globalStore.__newsdashChatMemory = new Map();
  }
  return globalStore.__newsdashChatMemory;
}

export function normalizeChatId(chatId: string | undefined | null): string {
  const id = String(chatId || '').trim();
  if (!id) return '';
  if (CHAT_ALIASES[id]) return CHAT_ALIASES[id];
  // Prefer phone JID when both forms appear in one string
  if (id.endsWith('@lid')) {
    // still usable; caller may also send phone form
    return id;
  }
  return id;
}

function memoryKeys(chatId: string): string[] {
  const primary = normalizeChatId(chatId);
  const keys = new Set<string>();
  if (primary) keys.add(primary);
  if (chatId?.trim()) keys.add(chatId.trim());
  for (const [alias, canon] of Object.entries(CHAT_ALIASES)) {
    if (canon === primary || alias === primary) {
      keys.add(alias);
      keys.add(canon);
    }
  }
  return [...keys];
}

export async function getChatMemory(chatId: string | undefined | null): Promise<ChatMemory | null> {
  if (!chatId) return null;
  
  const redis = getRedisClient();
  if (redis) {
    try {
      for (const key of memoryKeys(chatId)) {
        const row = await redis.get<ChatMemory>(key);
        if (row) return row;
      }
    } catch (err) {
      console.error('[redis] get memory failed', err);
    }
  }

  const map = store();
  for (const key of memoryKeys(chatId)) {
    const row = map.get(key);
    if (!row) continue;
    if (Date.now() - row.updatedAt > TTL_MS) {
      map.delete(key);
      continue;
    }
    return row;
  }
  return null;
}

function extractEntities(text: string): string[] {
  const s = String(text || '').toLowerCase();
  const found: string[] = [];
  const catalog: Array<[RegExp, string]> = [
    [/\b(bitcoin|btc|بٹ\s*کوائن)\b/i, 'bitcoin'],
    [/\b(ethereum|eth|ایتھیریم)\b/i, 'ethereum'],
    [/\b(solana|sol)\b/i, 'solana'],
    [/\b(gold|xau|sona|سونا)\b/i, 'gold'],
    [/\b(petrol|diesel|gasoline|fuel|پیٹرول|پٹرول|ڈیزل|ایندھن)\b/i, 'fuel'],
    [/\b(oil|crude|brent|wti|تیل)\b/i, 'oil'],
    [/\b(iran|ایران)\b/i, 'iran'],
    [/\b(israel|اسرائیل)\b/i, 'israel'],
    [/\b(ukraine|یوکرین)\b/i, 'ukraine'],
    [/\b(openai|chatgpt)\b/i, 'openai'],
    [/\b(weather|mosam|موسم)\b/i, 'weather'],
    [/\b(pakistan|پاکستان)\b/i, 'pakistan'],
  ];
  for (const [re, name] of catalog) {
    if (re.test(text) || re.test(s)) found.push(name);
  }
  return [...new Set(found)].slice(0, 8);
}

function wantsPriceWords(text: string): boolean {
  return /\b(price|rate|keemat|praiz)\b/i.test(text) || /قیمت|ریٹ|پرائز/.test(text);
}

/**
 * Strip follow-up decorations we append when resolving (e.g. "X — more detail /
 * latest update", "Y (related to: X)"). Without this, each vague follow-up
 * compounds onto lastQ and the session topic drifts within 2-3 turns.
 */
export function stableAsk(q: string): string {
  return String(q || '')
    .replace(/\s*[—-]\s*more detail\s*\/\s*latest update.*$/i, '')
    .replace(/\s*\((related to|follow-up after):[^)]*\)\s*$/i, '')
    .replace(/\.\s*User follow-up:.*$/i, '')
    .replace(/\s*latest details\s*$/i, '')
    .trim();
}

export async function setChatMemory(
  chatId: string | undefined | null,
  lastQ: string,
  lastTopic: string,
  extra?: {
    intent?: string;
    answerBrief?: string;
    preferredLang?: ReplyLanguage;
    assistantText?: string;
    shownUrls?: string[];
  },
): Promise<void> {
  const key = normalizeChatId(chatId) || String(chatId || '').trim();
  const cleanQ = stableAsk(lastQ);
  if (!key || !cleanQ) return;
  lastQ = cleanQ;

  const prev = await getChatMemory(key);
  const entities = extractEntities(`${lastQ} ${lastTopic}`);
  const turns: MemoryTurn[] = [...(prev?.turns || [])];
  turns.push({ role: 'user', text: lastQ.trim().slice(0, 400), at: Date.now() });
  if (extra?.assistantText?.trim()) {
    turns.push({
      role: 'assistant',
      text: extra.assistantText.trim().slice(0, 500),
      at: Date.now(),
    });
  }

  // Keep a rolling window of already-shown article URLs so follow-ups
  // ("more", "aur batao") surface NEW stories instead of repeating.
  const shownUrls = [...(prev?.shownUrls || []), ...(extra?.shownUrls || [])]
    .filter((u, i, arr) => u && arr.indexOf(u) === i)
    .slice(-40);

  const row: ChatMemory = {
    lastQ: lastQ.trim().slice(0, 400),
    lastTopic: (stableAsk(lastTopic) || lastQ).trim().slice(0, 120),
    lastIntent: extra?.intent || prev?.lastIntent,
    lastEntities: entities.length ? entities : prev?.lastEntities,
    lastAnswerBrief: (extra?.answerBrief || prev?.lastAnswerBrief || '').slice(0, 400),
    preferredLang: extra?.preferredLang || prev?.preferredLang,
    shownUrls,
    turns: turns.slice(-MAX_TURNS),
    updatedAt: Date.now(),
  };

  const redis = getRedisClient();
  if (redis) {
    try {
      for (const k of memoryKeys(key)) {
        await redis.set(k, row, { ex: 2700 }); // 45 min TTL
      }
      return;
    } catch (err) {
      console.error('[redis] set memory failed', err);
    }
  }

  const map = store();
  for (const k of memoryKeys(key)) map.set(k, row);
}

/** Short / referring messages that need the previous topic. */
export function isVagueFollowUp(q: string): boolean {
  const s = String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return true;
  if (s.length <= 2) return true;

  if (
    /^(more|aur|zyada|detail|details|continue|go on|batao|bataen|sunao|update|kyun|why|ok|okay|haan|han|yes|no|nahi|nahin|that|this|it|uska|uski|iske|iski|yeh|ye|and|phir|mazeed)$/i.test(
      s,
    )
  ) {
    return true;
  }

  if (
    /^(tell me more|and then|what about that|what about it|about that|about it|same again|repeat|as above)\b/i.test(
      s,
    )
  ) {
    return true;
  }

  // "explain more", "elaborate", "expand on it", "describe that"
  if (/^(explain|elaborate|expand|describe|clarify)(\s+(on|about))?(\s+(more|further|again|it|this|that))*\s*$/i.test(s)) {
    return true;
  }

  // Roman Urdu continues: "or batao" (or = aur), "aur batao", "kuch aur", "aur sunao"
  if (/^(or|aur|phir|acha|achha)\s+(batao|bataen|bata|sunao|sunaen|kuch|aur|kya)(\s+\S+)?$/i.test(s)) {
    return true;
  }
  if (/^(kuch aur|aur kuch|more info|more information|more details?|more news|any more|anything else|what else)\s*$/i.test(s)) {
    return true;
  }

  // Language preference only: "in English", "urdu mein", "in urdu"
  if (/^(in\s+)?(english|urdu|roman(\s+urdu)?|اردو)(\s+mein|\s+me)?$/i.test(s)) {
    return true;
  }
  if (/^(english|urdu)\s+(please|mein|me)?$/i.test(s)) return true;

  // "and gold", "aur bitcoin", "in pakistan", "for karachi", "what about diesel"
  if (
    /^(and|aur|also|plus|in|for|about|regarding|what about|how about|aur\s+ye|phir)\s+\S+/i.test(s)
  ) {
    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length <= 6) return true;
  }

  // Pronoun-heavy / referring short asks
  if (
    tokensHave(s, ['uska', 'uski', 'iska', 'iski', 'yeh', 'woh', 'that', 'this', 'it']) &&
    s.split(/\s+/).length <= 8
  ) {
    return true;
  }

  return false;
}

function tokensHave(s: string, words: string[]): boolean {
  const set = new Set(s.split(/\s+/));
  return words.some((w) => set.has(w));
}

/** True when the new ask likely continues the previous thread. */
export function needsConversationContext(
  q: string,
  memory: ChatMemory | null,
  previousQ: string,
): boolean {
  if (isVagueFollowUp(q)) return true;
  if (!previousQ && !memory) return false;

  const s = q.toLowerCase();
  const entities = extractEntities(q);
  const prevEntities = memory?.lastEntities || extractEntities(previousQ || memory?.lastTopic || '');

  // Shared entity with a short follow-up / comparison ask
  if (entities.length && prevEntities.some((e) => entities.includes(e))) {
    if (
      /\b(increase|decrease|up|down|zyada|kam|ziada|kam\s+hui|barh|gira|rose|fell|compare|vs|today|aaj|latest|abhi)\b/i.test(
        s,
      ) ||
      /زیادہ|کم|بڑھی|گری|آج|ابھی|انکریز|ڈیکریز/.test(q)
    ) {
      return true;
    }
  }

  // Referential language even in longer sentences
  if (
    /\b(that|this|it|those|these|same|previous|above|earlier|uska|uski|iska|iski|wo|woh|yeh|ye)\b/i.test(
      s,
    ) ||
    /اس\s*کا|اس\s*کی|یہ|وہ|اسی|پچھل/.test(q)
  ) {
    return true;
  }

  // Pure language-switch request with any leftovers
  if (/\b(in english|in urdu|english mein|urdu mein|انگریزی میں|اردو میں)\b/i.test(s)) {
    return true;
  }

  // Short existential/auxiliary follow-ups with no named entity of their own:
  // "is there a demo?", "does it work?", "can I try it?", "are there examples?"
  if (
    /^(is|are|was|were|does|do|did|can|could|will|would|has|have|any)\b/i.test(s) &&
    s.split(/\s+/).filter(Boolean).length <= 7 &&
    extractEntities(q).length === 0
  ) {
    return true;
  }

  // Short wh-selections referring to the previous answer: "which companies?", "who said that?"
  if (
    /^(which|who|whose|whom)\b/i.test(s) &&
    s.split(/\s+/).filter(Boolean).length <= 5 &&
    extractEntities(q).length === 0
  ) {
    return true;
  }

  // Quantity follow-ups about the previous answer: "how many employees are affected?"
  if (
    /^how (many|much)\b/i.test(s) &&
    s.split(/\s+/).filter(Boolean).length <= 8 &&
    extractEntities(q).length === 0
  ) {
    return true;
  }

  // Explain/describe asks without a topic of their own: "explain the risk", "describe the changes"
  if (
    /^(explain|describe|elaborate|clarify|summarize|summarise)\b/i.test(s) &&
    s.split(/\s+/).filter(Boolean).length <= 6 &&
    extractEntities(q).length === 0
  ) {
    return true;
  }

  // Ordinal references to listed items: "tell me about the first one", "the second story"
  if (
    /\b(first|second|third|fourth|last|1st|2nd|3rd)\s+(one|item|story|article|source|repo|news|headline)\b/i.test(s)
  ) {
    return true;
  }

  // Comparative follow-ups after a live price thread
  const liveIntent = memory?.lastIntent || '';
  if (
    /^(gold_price|crypto_price|fuel_price)$/.test(liveIntent) &&
    (s.split(/\s+/).filter(Boolean).length <= 10 ||
      /\b(increase|decrease|up|down|zyada|kam|rose|fell|aaj|today|latest|pkr|usd|more|less)\b/i.test(s) ||
      /زیادہ|کم|بڑھی|گری|آج|انکریز|ڈیکریز|پرائز|قیمت|ریٹ/.test(q))
  ) {
    return true;
  }

  if (
    previousQ &&
    extractEntities(previousQ).some((e) =>
      ['fuel', 'oil', 'gold', 'bitcoin', 'ethereum', 'solana'].includes(e),
    ) &&
    (/\b(increase|decrease|up|down|zyada|kam|rose|fell|aaj|today)\b/i.test(s) ||
      /زیادہ|کم|آج|انکریز|ڈیکریز|\?$/.test(q) ||
      s.split(/\s+/).filter(Boolean).length <= 6)
  ) {
    return true;
  }

  return false;
}

function detectLangPreference(q: string): ReplyLanguage | null {
  const s = q.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b(english|انگریزی)\b/i.test(s) && !/\b(urdu|اردو)\b/i.test(s)) return 'en';
  if (/\b(urdu|اردو)\b/i.test(s)) return 'ur';
  if (/^in\s+english\b/i.test(s) || /^english\b/i.test(s)) return 'en';
  return null;
}

function isLangOnlyFollowUp(q: string): boolean {
  const s = String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "in urdu", "urdu mein", "urdu please"
  if (/^(in\s+)?(english|urdu|roman(\s+urdu)?|اردو|انگریزی)(\s+(mein|me|mai|please|pls|mein\s+batao|mai\s+batao|mai\s+bolo|mein\s+bolo|mein\s+bata|mai\s+bata))?$/i.test(s)) return true;
  // "urdu mai batao", "urdu mein bataen", "english mai samjhao" etc.
  if (/^(english|urdu|roman\s+urdu|اردو|انگریزی)\s+(mai|mein|me)\s+(batao|bataen|bata|bataiye|samjhao|bolo|sunao|likho|likhein)$/i.test(s)) return true;
  return false;
}

export type ResolvedQuery = {
  effectiveQ: string;
  usedMemory: boolean;
  needsClarify: boolean;
  clarifyText?: string;
  preferredLang?: ReplyLanguage;
  memoryIntent?: string;
  turns?: MemoryTurn[];
  /** Article URLs already sent in this chat — exclude on follow-ups so "more" brings new stories. */
  shownUrls?: string[];
};

function historyToText(history?: HistoryTurn[] | null): string {
  if (!history?.length) return '';
  return history
    .slice(-6)
    .map((t) => {
      const role = String(t.role || 'user');
      const text = String(t.content || t.text || '').trim().slice(0, 240);
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

export async function resolveEffectiveQuery(args: {
  rawQ: string;
  previousQ?: string | null;
  chatId?: string | null;
  lang?: 'en' | 'ur';
  history?: HistoryTurn[] | null;
  previousIntent?: string | null;
}): Promise<ResolvedQuery> {
  const result = await resolveEffectiveQueryInternal(args);
  const memory = await getChatMemory(args.chatId);
  if (memory?.turns) {
    result.turns = memory.turns;
  }
  if (memory?.shownUrls?.length) {
    result.shownUrls = memory.shownUrls;
  }
  return result;
}

/**
 * Turn a follow-up / contextual ask into one clear lookup using session memory.
 */
async function resolveEffectiveQueryInternal(args: {
  rawQ: string;
  previousQ?: string | null;
  chatId?: string | null;
  lang?: 'en' | 'ur';
  history?: HistoryTurn[] | null;
  previousIntent?: string | null;
}): Promise<ResolvedQuery> {
  const rawQ = String(args.rawQ || '').trim();
  const memory = await getChatMemory(args.chatId);
  const previousQ = String(args.previousQ || memory?.lastQ || '').trim();
  const previousTopic = memory?.lastTopic || '';
  const previousIntent = String(args.previousIntent || memory?.lastIntent || '').trim();
  // Seed intent onto an ephemeral memory view for context detection
  const memoryView: ChatMemory | null = memory
    ? { ...memory, lastIntent: previousIntent || memory.lastIntent }
    : previousIntent || previousQ
      ? {
          lastQ: previousQ,
          lastTopic: previousTopic || previousQ,
          lastIntent: previousIntent || undefined,
          lastEntities: extractEntities(previousQ),
          turns: [],
          updatedAt: Date.now(),
        }
      : null;
  const histText = historyToText(args.history);
  const wantsContext = needsConversationContext(rawQ, memoryView, previousQ);

  if (!wantsContext) {
    return {
      effectiveQ: rawQ,
      usedMemory: false,
      needsClarify: false,
      preferredLang: memory?.preferredLang,
      memoryIntent: undefined,
    };
  }

  if (!previousQ && !previousTopic && !histText) {
    const isTrulyVague =
      rawQ.split(/\s+/).length <= 3 ||
      /^(more|aur|zyada|detail|details|continue|go on|batao|bataen|sunao|update|kyun|why|ok|okay|haan|han|yes|no|nahi|nahin|mazeed|that|this|it|those|these|here|there)$/i.test(
        rawQ.toLowerCase().trim()
      );

    if (!isTrulyVague) {
      return {
        effectiveQ: rawQ,
        usedMemory: false,
        needsClarify: false,
        preferredLang: memory?.preferredLang,
        memoryIntent: undefined,
      };
    }

    const clarifyText =
      args.lang === 'ur'
        ? [
            '*NewsDash Analyst*',
            '',
            'مجھے پچھلا موضوع یاد نہیں۔ براہِ کرم واضح سوال لکھیں، مثلاً:',
            '• bitcoin price',
            '• diesel price today',
            '• gold price now',
            '• weather in Karachi',
          ].join('\n')
        : [
            '*NewsDash Analyst*',
            '',
            'I need a bit more context. What should I look up?',
            '',
            'Try something specific like:',
            '• bitcoin price',
            '• diesel price today',
            '• gold price now',
            '• weather in Karachi',
          ].join('\n');
    return {
      effectiveQ: rawQ,
      usedMemory: false,
      needsClarify: true,
      clarifyText,
    };
  }

  const langPref = detectLangPreference(rawQ);

  // Language-only follow-up: keep the same question, switch reply language
  if (isLangOnlyFollowUp(rawQ) && previousQ) {
    return {
      effectiveQ: previousQ,
      usedMemory: true,
      needsClarify: false,
      preferredLang: langPref || memory?.preferredLang,
      memoryIntent: previousIntent || undefined,
    };
  }

  // Fast path: more / detail
  const lower = rawQ.toLowerCase();
  if (
    /^(more|aur|zyada|detail|details|continue|go on|batao|update|tell me more|mazeed)\b/i.test(lower) ||
    /^(or|aur|phir)\s+(batao|bataen|sunao)\b/i.test(lower) ||
    /^(explain|elaborate|expand)(\s+(on|about))?(\s+(more|further|again|it|this|that))*\s*$/i.test(lower)
  ) {
    const base = previousQ || previousTopic;
    return {
      effectiveQ: `${base} — more detail / latest update`,
      usedMemory: true,
      needsClarify: false,
      preferredLang: langPref || memory?.preferredLang,
      memoryIntent: previousIntent || undefined,
    };
  }

  if (/^(and|aur|also|plus)\s+(.+)$/i.test(rawQ)) {
    const add = rawQ.replace(/^(and|aur|also|plus)\s+/i, '').trim();
    // Asset switches should become a clean new ask, not "bitcoin related to gold"
    const addEntities = extractEntities(add);
    if (addEntities.some((e) => ['bitcoin', 'ethereum', 'solana', 'gold', 'fuel', 'oil'].includes(e))) {
      const priceLike =
        wantsPriceWords(add) || addEntities.some((e) => ['bitcoin', 'ethereum', 'solana', 'gold', 'fuel', 'oil'].includes(e));
      return {
        effectiveQ: priceLike && !/\bprice\b/i.test(add) ? `${add} price` : add,
        usedMemory: true,
        needsClarify: false,
        preferredLang: langPref || memory?.preferredLang,
        memoryIntent: undefined, // intentional topic switch
      };
    }
    return {
      effectiveQ: `${add} (related to: ${previousQ || previousTopic})`,
      usedMemory: true,
      needsClarify: false,
      preferredLang: langPref || memory?.preferredLang,
      memoryIntent: previousIntent || undefined,
    };
  }

  if (/^(what about|how about|about)\s+(.+)$/i.test(rawQ)) {
    const add = rawQ.replace(/^(what about|how about|about)\s+/i, '').trim();
    return {
      effectiveQ: `${add} (follow-up after: ${previousQ || previousTopic})`,
      usedMemory: true,
      needsClarify: false,
      preferredLang: langPref || memory?.preferredLang,
      memoryIntent: previousIntent || undefined,
    };
  }

  if (/^(in|for)\s+(.+)$/i.test(rawQ) && !langPref) {
    const place = rawQ.replace(/^(in|for)\s+/i, '').trim();
    return {
      effectiveQ: `${previousQ || previousTopic} in ${place}`,
      usedMemory: true,
      needsClarify: false,
      preferredLang: memory?.preferredLang,
      memoryIntent: previousIntent || undefined,
    };
  }

  // Domain sticky: if last intent was a live plugin, keep short comparisons on that asset
  if (
    previousIntent &&
    /^(gold_price|crypto_price|fuel_price|weather)$/.test(previousIntent) &&
    (isVagueFollowUp(rawQ) ||
      /\b(increase|decrease|up|down|zyada|kam|rose|fell|aaj|today|latest|pkr|usd)\b/i.test(lower) ||
      /زیادہ|کم|آج|انکریز|ڈیکریز|پرائز|قیمت/.test(rawQ))
  ) {
    const domainHint =
      previousIntent === 'fuel_price'
        ? 'diesel petrol fuel oil price'
        : previousIntent === 'gold_price'
          ? 'gold price'
          : previousIntent === 'crypto_price'
            ? previousTopic || 'bitcoin price'
            : previousTopic || previousQ;
    return {
      effectiveQ: `${domainHint}. User follow-up: ${rawQ}. Prior ask: ${previousQ}`,
      usedMemory: true,
      needsClarify: false,
      preferredLang: langPref || memory?.preferredLang,
      memoryIntent: previousIntent,
    };
  }

  if (!process.env.GROQ_API_KEY) {
    return {
      effectiveQ: `${previousQ || previousTopic} ${rawQ}`.trim(),
      usedMemory: true,
      needsClarify: false,
      preferredLang: langPref || memory?.preferredLang,
      memoryIntent: previousIntent || undefined,
    };
  }

  try {
    const merged = await groqChat(
      [
        {
          role: 'system',
          content: `You merge WhatsApp follow-ups into ONE clear lookup question for a news/markets bot.
Rules:
- Keep the prior topic/entities unless the user clearly switches.
- If user only asks for English/Urdu, return the previous question unchanged.
- If prior intent was a live price (gold/bitcoin/diesel/petrol/weather), keep it as a price/weather ask.
- Output ONLY the merged question text, no quotes or explanation.
- Prefer concise English keywords for search, but keep user meaning (price up/down, today, Pakistan, etc.).`,
        },
        {
          role: 'user',
          content: [
            `Previous question: ${previousQ || '(none)'}`,
            `Previous topic: ${previousTopic || '(none)'}`,
            `Previous intent: ${previousIntent || '(none)'}`,
            `Previous answer brief: ${memory?.lastAnswerBrief || '(none)'}`,
            histText ? `Recent turns:\n${histText}` : '',
            `Follow-up: ${rawQ}`,
            'Merged question:',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      { maxTokens: 80, temperature: 0 },
    );
    const effectiveQ = merged.replace(/^["']|["']$/g, '').trim();
    if (effectiveQ.length >= 3) {
      return {
        effectiveQ,
        usedMemory: true,
        needsClarify: false,
        preferredLang: langPref || memory?.preferredLang,
        memoryIntent: previousIntent || undefined,
      };
    }
  } catch {
    // fall through
  }

  return {
    effectiveQ: `${previousQ || previousTopic} ${rawQ}`.trim(),
    usedMemory: true,
    needsClarify: false,
    preferredLang: langPref || memory?.preferredLang,
    memoryIntent: previousIntent || undefined,
  };
}
