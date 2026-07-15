import { groqChat } from '@/lib/groq';

export type ChatMemory = {
  lastQ: string;
  lastTopic: string;
  updatedAt: number;
};

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const globalStore = globalThis as typeof globalThis & {
  __newsdashChatMemory?: Map<string, ChatMemory>;
};

function store(): Map<string, ChatMemory> {
  if (!globalStore.__newsdashChatMemory) {
    globalStore.__newsdashChatMemory = new Map();
  }
  return globalStore.__newsdashChatMemory;
}

export function getChatMemory(chatId: string | undefined | null): ChatMemory | null {
  if (!chatId) return null;
  const row = store().get(chatId);
  if (!row) return null;
  if (Date.now() - row.updatedAt > TTL_MS) {
    store().delete(chatId);
    return null;
  }
  return row;
}

export function setChatMemory(
  chatId: string | undefined | null,
  lastQ: string,
  lastTopic: string,
): void {
  if (!chatId || !lastQ.trim()) return;
  store().set(chatId, {
    lastQ: lastQ.trim().slice(0, 400),
    lastTopic: (lastTopic || lastQ).trim().slice(0, 120),
    updatedAt: Date.now(),
  });
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
    /^(more|aur|zyada|detail|details|continue|go on|batao|bataen|sunao|update|kyun|why|ok|okay|haan|han|yes|no|nahi|nahin|that|this|it|uska|uski|iske|iski|yeh|ye)$/i.test(
      s,
    )
  ) {
    return true;
  }

  if (/^(tell me more|and then|what about that|what about it|about that|about it)\b/i.test(s)) {
    return true;
  }

  // "and gold", "aur bitcoin", "in pakistan", "for karachi"
  if (/^(and|aur|also|plus|in|for|about|regarding)\s+\S+/i.test(s)) {
    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length <= 4) return true;
  }

  return false;
}

export type ResolvedQuery = {
  effectiveQ: string;
  usedMemory: boolean;
  needsClarify: boolean;
  clarifyText?: string;
};

/**
 * Turn a vague follow-up into a full ask using previousQ / memory.
 */
export async function resolveEffectiveQuery(args: {
  rawQ: string;
  previousQ?: string | null;
  chatId?: string | null;
  lang?: 'en' | 'ur';
}): Promise<ResolvedQuery> {
  const rawQ = String(args.rawQ || '').trim();
  const memory = getChatMemory(args.chatId);
  const previousQ = String(args.previousQ || memory?.lastQ || '').trim();
  const vague = isVagueFollowUp(rawQ);

  if (!vague) {
    return { effectiveQ: rawQ, usedMemory: false, needsClarify: false };
  }

  if (!previousQ) {
    const clarifyText =
      args.lang === 'ur'
        ? [
            '*NewsDash Analyst*',
            '',
            'مجھے پچھلا موضوع یاد نہیں۔ براہِ کرم واضح سوال لکھیں، مثلاً:',
            '• bitcoin price',
            '• OpenAI news',
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
            '• OpenAI news',
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

  // Fast path: modifier follow-ups
  const lower = rawQ.toLowerCase();
  if (/^(more|aur|zyada|detail|details|continue|go on|batao|update|tell me more)\b/i.test(lower)) {
    return {
      effectiveQ: `${previousQ} — more detail / latest update`,
      usedMemory: true,
      needsClarify: false,
    };
  }
  if (/^(and|aur|also|plus)\s+(.+)$/i.test(rawQ)) {
    const add = rawQ.replace(/^(and|aur|also|plus)\s+/i, '').trim();
    return {
      effectiveQ: `${add} (related to: ${previousQ})`,
      usedMemory: true,
      needsClarify: false,
    };
  }
  if (/^(in|for)\s+(.+)$/i.test(rawQ)) {
    const place = rawQ.replace(/^(in|for)\s+/i, '').trim();
    return {
      effectiveQ: `${previousQ} in ${place}`,
      usedMemory: true,
      needsClarify: false,
    };
  }

  if (!process.env.GROQ_API_KEY) {
    return {
      effectiveQ: `${previousQ} ${rawQ}`.trim(),
      usedMemory: true,
      needsClarify: false,
    };
  }

  try {
    const merged = await groqChat(
      [
        {
          role: 'system',
          content:
            'Merge a WhatsApp follow-up into one clear English news/market question. Reply with ONLY the merged question, no quotes.',
        },
        {
          role: 'user',
          content: `Previous question: ${previousQ}\nFollow-up: ${rawQ}\nMerged question:`,
        },
      ],
      { maxTokens: 60, temperature: 0 },
    );
    const effectiveQ = merged.replace(/^["']|["']$/g, '').trim();
    if (effectiveQ.length >= 3) {
      return { effectiveQ, usedMemory: true, needsClarify: false };
    }
  } catch {
    // fall through
  }

  return {
    effectiveQ: `${previousQ} ${rawQ}`.trim(),
    usedMemory: true,
    needsClarify: false,
  };
}
