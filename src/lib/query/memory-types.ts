import type { ReplyLanguage } from '@/lib/query/grounded-answer';

export type MemoryTurn = {
  role: 'user' | 'assistant';
  text: string;
  at: number;
};

/** One cited article kept as evidence for translate/elaborate follow-ups. */
export type StoredSource = {
  title: string;
  source: string;
  url: string;
  publishedAt?: string;
  body?: string;
};

/**
 * Legacy single-slot view of conversation memory.
 * Backed by ConversationState (topic stack + rolling summary).
 */
export type ChatMemory = {
  lastQ: string;
  lastTopic: string;
  lastIntent?: string;
  lastEntities?: string[];
  lastAnswerBrief?: string;
  preferredLang?: ReplyLanguage;
  shownUrls?: string[];
  lastAnswer?: string;
  lastSources?: StoredSource[];
  turns: MemoryTurn[];
  updatedAt: number;
};

export type HistoryTurn = {
  role?: string;
  content?: string;
  text?: string;
};
