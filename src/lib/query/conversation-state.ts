import { groqBudgetTight, groqChat } from '@/lib/groq';
import type { ReplyLanguage } from '@/lib/query/grounded-answer';
import type { ChatMemory, MemoryTurn, StoredSource } from '@/lib/query/memory-types';
import { getRedisClient, warnIfMemoryEphemeral } from '@/lib/kv/redis';

export type ConversationTopic = {
  id: string;
  label: string;
  lastQ: string;
  lastAnswerBrief: string;
  lastAnswer?: string;
  lastSources: StoredSource[];
  intent?: string;
  entities: string[];
  shownUrls: string[];
  openedAt: number;
  lastTouchedAt: number;
};

export type ConversationState = {
  version: 2;
  chatId: string;
  activeTopicId: string | null;
  topics: ConversationTopic[];
  rollingSummary: string;
  recentTurns: MemoryTurn[];
  preferredLang?: ReplyLanguage;
  userFacts?: string[];
  updatedAt: number;
};

const TTL_MS = 45 * 60 * 1000;
/** Redis TTL — also bounded by calendar-day reset on read. */
const REDIS_TTL_SEC = 24 * 60 * 60;
const SESSION_TZ = 'Asia/Karachi';
const MAX_TOPICS = 5;
const MAX_RECENT_TURNS = 6;
const MAX_USER_FACTS = 10;
const STATE_VERSION = 2 as const;

const globalStore = globalThis as typeof globalThis & {
  __newsdashConversationState?: Map<string, ConversationState>;
};

function store(): Map<string, ConversationState> {
  if (!globalStore.__newsdashConversationState) {
    globalStore.__newsdashConversationState = new Map();
  }
  return globalStore.__newsdashConversationState;
}

function sessionDayKey(ts: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SESSION_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ts));
}

/** True when memory belongs to a prior calendar day (fresh session each day). */
export function isPreviousSessionDay(updatedAt: number | undefined | null): boolean {
  if (!updatedAt || !Number.isFinite(updatedAt)) return false;
  return sessionDayKey(updatedAt) !== sessionDayKey(Date.now());
}

function isExpiredConversation(row: { updatedAt?: number }): boolean {
  const updatedAt = row.updatedAt || 0;
  if (!updatedAt) return true;
  if (isPreviousSessionDay(updatedAt)) return true;
  return Date.now() - updatedAt > TTL_MS;
}

export function slugifyTopicId(label: string): string {
  const base = String(label || 'topic')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || `topic-${Date.now().toString(36)}`;
}

function uniqueSlug(label: string, existing: ConversationTopic[]): string {
  const id = slugifyTopicId(label);
  if (!existing.some((t) => t.id === id)) return id;
  let n = 2;
  while (existing.some((t) => t.id === `${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

/** Adapt ConversationState → legacy ChatMemory for existing callers. */
export function conversationStateToChatMemory(state: ConversationState): ChatMemory {
  const active =
    (state.activeTopicId && state.topics.find((t) => t.id === state.activeTopicId)) ||
    state.topics[0];
  return {
    lastQ: active?.lastQ || '',
    lastTopic: active?.label || '',
    lastIntent: active?.intent,
    lastEntities: active?.entities,
    lastAnswerBrief: active?.lastAnswerBrief,
    preferredLang: state.preferredLang,
    shownUrls: active?.shownUrls?.length
      ? active.shownUrls
      : [...new Set(state.topics.flatMap((t) => t.shownUrls))].slice(-40),
    lastAnswer: active?.lastAnswer,
    lastSources: active?.lastSources,
    turns: state.recentTurns,
    updatedAt: state.updatedAt,
  };
}

/** Migrate legacy ChatMemory rows (no version) into ConversationState. */
export function chatMemoryToConversationState(
  chatId: string,
  memory: ChatMemory,
): ConversationState {
  const now = memory.updatedAt || Date.now();
  const label = memory.lastTopic || memory.lastQ || 'Conversation';
  const id = slugifyTopicId(label);
  const topic: ConversationTopic = {
    id,
    label: label.slice(0, 120),
    lastQ: memory.lastQ || '',
    lastAnswerBrief: memory.lastAnswerBrief || '',
    lastAnswer: memory.lastAnswer,
    lastSources: memory.lastSources || [],
    intent: memory.lastIntent,
    entities: memory.lastEntities || [],
    shownUrls: memory.shownUrls || [],
    openedAt: now,
    lastTouchedAt: now,
  };
  return {
    version: STATE_VERSION,
    chatId,
    activeTopicId: id,
    topics: [topic],
    rollingSummary: '',
    recentTurns: memory.turns || [],
    preferredLang: memory.preferredLang,
    userFacts: [],
    updatedAt: now,
  };
}

function isConversationState(row: unknown): row is ConversationState {
  return Boolean(
    row &&
      typeof row === 'object' &&
      (row as ConversationState).version === STATE_VERSION &&
      Array.isArray((row as ConversationState).topics),
  );
}

function isLegacyChatMemory(row: unknown): row is ChatMemory {
  return Boolean(
    row &&
      typeof row === 'object' &&
      typeof (row as ChatMemory).lastQ === 'string' &&
      Array.isArray((row as ChatMemory).turns),
  );
}

export async function getConversationState(
  chatId: string | undefined | null,
  memoryKeys: (id: string) => string[],
): Promise<ConversationState | null> {
  if (!chatId) return null;
  warnIfMemoryEphemeral();

  const redis = getRedisClient();
  if (redis) {
    try {
      for (const key of memoryKeys(chatId)) {
        const row = await redis.get<ConversationState | ChatMemory>(key);
        if (!row) continue;
        const updatedAt =
          (row as ConversationState).updatedAt || (row as ChatMemory).updatedAt || 0;
        if (isExpiredConversation({ updatedAt })) {
          try {
            await redis.del(key);
          } catch {
            /* ignore */
          }
          continue;
        }
        if (isConversationState(row)) return row;
        if (isLegacyChatMemory(row)) return chatMemoryToConversationState(chatId, row);
      }
    } catch (err) {
      console.error('[redis] get conversation state failed', err);
    }
  }

  const map = store();
  for (const key of memoryKeys(chatId)) {
    const row = map.get(key) as ConversationState | ChatMemory | undefined;
    if (!row) continue;
    const updatedAt =
      (row as ConversationState).updatedAt || (row as ChatMemory).updatedAt || 0;
    if (isExpiredConversation({ updatedAt })) {
      map.delete(key);
      continue;
    }
    if (isConversationState(row)) return row;
    if (isLegacyChatMemory(row)) {
      const adapted = chatMemoryToConversationState(chatId, row);
      map.set(key, adapted);
      return adapted;
    }
  }
  return null;
}

export async function saveConversationState(
  state: ConversationState,
  memoryKeys: (id: string) => string[],
): Promise<void> {
  warnIfMemoryEphemeral();
  const key = state.chatId;
  if (!key) return;
  state.updatedAt = Date.now();

  const redis = getRedisClient();
  if (redis) {
    try {
      for (const k of memoryKeys(key)) {
        await redis.set(k, state, { ex: REDIS_TTL_SEC });
      }
      return;
    } catch (err) {
      console.error('[redis] set conversation state failed', err);
    }
  }

  const map = store();
  for (const k of memoryKeys(key)) map.set(k, state);
}

/**
 * Test-only: write a legacy ChatMemory (no version) into the in-process Map,
 * optionally skipping Redis so the adapter path is exercised locally.
 */
export function seedLegacyChatMemoryForTests(
  chatId: string,
  memory: ChatMemory,
  opts?: { inProcessOnly?: boolean; memoryKeys?: (id: string) => string[] },
): ConversationState {
  const key = String(chatId || '').trim();
  const adapted = chatMemoryToConversationState(key, memory);
  const keys = opts?.memoryKeys?.(key) || [key];
  const map = store();
  if (opts?.inProcessOnly) {
    // Store the RAW legacy shape under every alias so getConversationState's
    // isLegacyChatMemory branch is exercised on next read.
    for (const k of keys) map.set(k, memory as unknown as ConversationState);
    return adapted;
  }
  for (const k of keys) map.set(k, adapted);
  return adapted;
}

function extractEntitiesLocal(text: string): string[] {
  const s = String(text || '').toLowerCase();
  const found: string[] = [];
  const catalog: Array<[RegExp, string]> = [
    [/\b(bitcoin|btc)\b/i, 'bitcoin'],
    [/\b(ethereum|eth)\b/i, 'ethereum'],
    [/\b(solana|sol)\b/i, 'solana'],
    [/\b(gold|xau|sona)\b/i, 'gold'],
    [/\b(petrol|diesel|fuel)\b/i, 'fuel'],
    [/\b(openai|chatgpt)\b/i, 'openai'],
    [/\b(weather|mosam)\b/i, 'weather'],
    [/\b(pakistan)\b/i, 'pakistan'],
  ];
  for (const [re, name] of catalog) {
    if (re.test(text) || re.test(s)) found.push(name);
  }
  return [...new Set(found)].slice(0, 8);
}

/** Non-LLM fallback when Groq is unavailable for summarization. */
export function appendSummaryFallback(
  existing: string,
  dropped: MemoryTurn[],
  topicLabel?: string,
): string {
  const label = topicLabel || 'the previous topic';
  const snippet = dropped
    .filter((t) => t.role === 'user')
    .map((t) => t.text.slice(0, 80))
    .join(' / ');
  const addition = snippet
    ? `Also discussed: ${label} (${snippet}).`
    : `Also discussed: ${label}.`;
  return [existing.trim(), addition].filter(Boolean).join(' ').slice(0, 1200);
}

async function summarizeDroppedTurns(
  existingSummary: string,
  dropped: MemoryTurn[],
): Promise<string> {
  if (!dropped.length) return existingSummary;
  // Heuristic summary when Groq is unavailable or soft TPD budget is tight —
  // summarizer is optional and burns tokens without affecting routing.
  if (!process.env.GROQ_API_KEY || groqBudgetTight()) {
    return appendSummaryFallback(existingSummary, dropped);
  }
  const exchange = dropped
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n')
    .slice(0, 1500);
  try {
    const updated = await groqChat(
      [
        {
          role: 'system',
          content:
            'Update this running conversation summary with the new exchange. Keep it to 2-4 sentences, third person, factual, no editorializing. Preserve anything a good assistant would need to remember later (topics discussed, user preferences stated, unresolved threads). Output ONLY the updated summary.',
        },
        {
          role: 'user',
          content: `Current summary:\n${existingSummary || '(empty)'}\n\nNew exchange being rolled out of the recent window:\n${exchange}\n\nUpdated summary:`,
        },
      ],
      { maxTokens: 120, temperature: 0, retries: 0, skipIfBudgetTight: true },
    );
    const cleaned = updated.trim();
    return cleaned.length >= 8 ? cleaned.slice(0, 1200) : appendSummaryFallback(existingSummary, dropped);
  } catch {
    return appendSummaryFallback(existingSummary, dropped);
  }
}

export type TouchTopicArgs = {
  chatId: string;
  topicLabel: string;
  lastQ: string;
  intent?: string;
  answerBrief?: string;
  preferredLang?: ReplyLanguage;
  assistantText?: string;
  userText?: string;
  shownUrls?: string[];
  answerFull?: string;
  sources?: StoredSource[];
  /** Force continue this topic id when known (from classifier). */
  topicId?: string | null;
  /** Open a new topic even if labels are similar. */
  forceNewTopic?: boolean;
  userFacts?: string[];
};

/**
 * Upsert active topic, append turns, roll summary when window overflows.
 * Returns the updated state (caller should persist via saveConversationState).
 */
export async function applyConversationTurn(
  prev: ConversationState | null,
  args: TouchTopicArgs,
): Promise<ConversationState> {
  const now = Date.now();
  const chatId = args.chatId;
  const state: ConversationState = prev
    ? { ...prev, topics: [...prev.topics.map((t) => ({ ...t, shownUrls: [...t.shownUrls], lastSources: [...t.lastSources], entities: [...t.entities] }))] }
    : {
        version: STATE_VERSION,
        chatId,
        activeTopicId: null,
        topics: [],
        rollingSummary: '',
        recentTurns: [],
        preferredLang: args.preferredLang,
        userFacts: [],
        updatedAt: now,
      };

  const label = (args.topicLabel || args.lastQ || 'Conversation').trim().slice(0, 120);
  let topic: ConversationTopic | undefined;

  if (args.topicId) {
    topic = state.topics.find((t) => t.id === args.topicId);
  }
  if (!topic && !args.forceNewTopic && state.activeTopicId) {
    topic = state.topics.find((t) => t.id === state.activeTopicId);
  }
  if (!topic && !args.forceNewTopic) {
    const needle = label.toLowerCase();
    topic = state.topics.find(
      (t) =>
        t.label.toLowerCase() === needle ||
        t.label.toLowerCase().includes(needle) ||
        needle.includes(t.label.toLowerCase()),
    );
  }
  if (!topic) {
    const id = uniqueSlug(label, state.topics);
    topic = {
      id,
      label,
      lastQ: args.lastQ,
      lastAnswerBrief: '',
      lastSources: [],
      entities: [],
      shownUrls: [],
      openedAt: now,
      lastTouchedAt: now,
    };
    state.topics.unshift(topic);
  }

  topic.label = label || topic.label;
  topic.lastQ = args.lastQ.trim().slice(0, 400);
  topic.lastTouchedAt = now;
  if (args.intent) topic.intent = args.intent;
  if (args.answerBrief) topic.lastAnswerBrief = args.answerBrief.slice(0, 400);
  if (args.answerFull) topic.lastAnswer = args.answerFull.slice(0, 2500);
  if (args.sources?.length) {
    topic.lastSources = args.sources.slice(0, 8).map((s) => ({
      ...s,
      body: (s.body || '').slice(0, 2000),
    }));
  }
  const entities = extractEntitiesLocal(`${args.lastQ} ${label}`);
  if (entities.length) topic.entities = entities;
  if (args.shownUrls?.length) {
    topic.shownUrls = [...topic.shownUrls, ...args.shownUrls]
      .filter((u, i, arr) => u && arr.indexOf(u) === i)
      .slice(-40);
  }

  state.activeTopicId = topic.id;
  state.topics = [
    topic,
    ...state.topics.filter((t) => t.id !== topic!.id),
  ]
    .sort((a, b) => b.lastTouchedAt - a.lastTouchedAt)
    .slice(0, MAX_TOPICS);

  if (args.preferredLang) state.preferredLang = args.preferredLang;
  if (args.userFacts?.length) {
    state.userFacts = [...(state.userFacts || []), ...args.userFacts]
      .filter((f, i, arr) => f && arr.indexOf(f) === i)
      .slice(0, MAX_USER_FACTS);
  }

  const turns = [...state.recentTurns];
  turns.push({
    role: 'user',
    text: (args.userText || args.lastQ).trim().slice(0, 400),
    at: now,
  });
  if (args.assistantText?.trim()) {
    turns.push({
      role: 'assistant',
      text: args.assistantText.trim().slice(0, 500),
      at: now,
    });
  }

  if (turns.length > MAX_RECENT_TURNS) {
    const overflow = turns.length - MAX_RECENT_TURNS;
    const dropped = turns.splice(0, overflow);
    state.rollingSummary = await summarizeDroppedTurns(state.rollingSummary, dropped);
  }
  state.recentTurns = turns;
  state.updatedAt = now;
  return state;
}

export function findTopicByHint(
  state: ConversationState,
  hint: string,
): ConversationTopic | null {
  const s = hint.toLowerCase().trim();
  if (!s) return null;
  const byId = state.topics.find((t) => t.id === s);
  if (byId) return byId;
  return (
    state.topics.find(
      (t) =>
        t.label.toLowerCase().includes(s) ||
        s.includes(t.label.toLowerCase()) ||
        t.entities.some((e) => s.includes(e) || e.includes(s)),
    ) || null
  );
}

export { MAX_TOPICS, MAX_RECENT_TURNS, TTL_MS };
