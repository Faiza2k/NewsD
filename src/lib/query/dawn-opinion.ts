/**
 * Dawn Opinion section browse → pick → read.
 * Live from https://www.dawn.com/feeds/opinion — never hardcode daily titles.
 */
import Parser from 'rss-parser';
import { extractValidDate, isFresh } from '@/lib/feeds/date-utils';
import type { ConversationState } from '@/lib/query/conversation-state';
import type { StoredSource } from '@/lib/query/memory-types';
import type { ReplyLanguage } from '@/lib/query/grounded-answer';

export const DAWN_OPINION_FEED_URL = 'https://www.dawn.com/feeds/opinion';
export const DAWN_OPINION_LIST_INTENT = 'dawn_opinion_list';
export const DAWN_OPINION_LIST_MAX = 8;

export type DawnOpinionItem = {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  body?: string;
  author?: string;
};

const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'NewsDash/1.0 Intelligence Dashboard',
    Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml',
  },
  customFields: {
    item: [
      ['dc:creator', 'creator'],
      ['creator', 'creator'],
      ['author', 'author'],
    ],
  },
});

function stripHtml(s: string): string {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u200B-\u200F\u2060\uFEFF\u00AD]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dawn RSS often ships placeholder emails — keep human-readable bylines only. */
function sanitizeDawnAuthor(raw: string): string | undefined {
  let s = stripHtml(raw).trim();
  if (!s || /^none$/i.test(s)) return undefined;
  s = s.replace(/[\w.+-]+@[\w.-]+\.\w+/gi, ' ');
  s = s.replace(/\s*[-—–|]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || /^none$/i.test(s)) return undefined;
  return s.slice(0, 80);
}

/** Dawn Opinion *section* asks (not generic “give me opinions”). */
export function isDawnOpinionListAsk(q: string): boolean {
  const raw = String(q || '').trim();
  if (!raw) return false;
  const hasDawn = /\bdawn\b/i.test(raw) || /ڈان/.test(raw);
  if (!hasDawn) return false;
  return (
    /\bopinion(s)?\b/i.test(raw) ||
    /\beditorial(s)?\b/i.test(raw) ||
    /\bcolumns?\b/i.test(raw) ||
    /رائے|اداریہ|کالم/.test(raw) ||
    (/\blist\b/i.test(raw) && /\b(opinion|editorial|column)/i.test(raw))
  );
}

export function isDawnOpinionMenuPending(args: {
  memoryIntent?: string;
  topicIntent?: string;
  lastBrief?: string;
  lastAnswer?: string;
}): boolean {
  const intent = args.memoryIntent || args.topicIntent || '';
  if (intent === DAWN_OPINION_LIST_INTENT) return true;
  const hay = `${args.lastBrief || ''} ${args.lastAnswer || ''}`;
  return /dawn opinion|pick one|reply with a number|number \(e\.g\.|ایک کا انتخاب|نمبر لکھیں/i.test(
    hay,
  );
}

const ENGLISH_ORDINAL: Record<string, number> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  sixth: 6,
  '6th': 6,
  seventh: 7,
  '7th': 7,
  eighth: 8,
  '8th': 8,
};

function parseEnglishOrdinalIndex(raw: string, itemCount: number): number | null {
  const s = raw.toLowerCase();
  if (/\blast\b/.test(s)) {
    return itemCount > 0 ? itemCount - 1 : null;
  }
  const wordMatch = s.match(
    /\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|1st|2nd|3rd|4th|5th|6th|7th|8th)\b(?:\s+(?:one|piece|article|column|story|item|option|entry|pick|opinion(?:\s+piece)?|from\s+dawn))?/,
  );
  if (wordMatch) {
    const n = ENGLISH_ORDINAL[wordMatch[1]];
    if (n != null && n >= 1 && n <= itemCount) return n - 1;
  }
  return null;
}

/** Bare / conversational menu picks: "3", "the 3", "#2", "option 4". */
function parseNumericPickIndex(raw: string, itemCount: number): number | null {
  const s = raw.trim();
  const patterns = [
    /^(?:read|open|number|#|no\.?|option|pick|choose)?\s*(\d{1,2})\s*$/i,
    /^(?:the|no\.?|option|pick|#)\s*(\d{1,2})\s*$/i,
    /^(\d{1,2})[\).]?\s*$/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= 1 && n <= itemCount) return n - 1;
    return null;
  }
  const embedded = s.match(/\b(?:the|no\.?|option|pick|#)\s*(\d{1,2})\b/i);
  if (embedded && s.split(/\s+/).length <= 6) {
    const n = Number(embedded[1]);
    if (n >= 1 && n <= itemCount) return n - 1;
  }
  return null;
}

/** Dawn Opinion menu items from topic stack (not whatever topic is currently active). */
export function dawnMenuSourcesFromState(
  state: ConversationState | null | undefined,
  fallback: StoredSource[] = [],
): StoredSource[] {
  const dawnTopic = state?.topics?.find(
    (t) => t.intent === DAWN_OPINION_LIST_INTENT && t.lastSources?.length,
  );
  if (dawnTopic?.lastSources?.length) return dawnTopic.lastSources;
  const dawnOnly = fallback.filter(
    (s) => /dawn/i.test(String(s.source || '')) || /dawn\.com/i.test(String(s.url || '')),
  );
  return dawnOnly.length ? dawnOnly : fallback;
}

/** User is trying to pick from the Dawn list but phrasing may not parse. */
export function looksLikeDawnPickAttempt(q: string): boolean {
  const raw = String(q || '').trim();
  if (!raw || raw.length > 120) return false;
  if (/^\d{1,2}\s*$/.test(raw)) return true;
  if (parseNumericPickIndex(raw, 8) != null) return true;
  if (parseEnglishOrdinalIndex(raw, 8) != null) return true;
  if (/دوسرا|پہلا|تیسرا|چوتھا|پانچواں|چھٹا|نمبر/.test(raw)) return true;
  if (/\b(read|open|show|tell me about)\b/i.test(raw) && raw.split(/\s+/).length <= 10) {
    return true;
  }
  return raw.split(/\s+/).filter(Boolean).length <= 6;
}

export function buildDawnOpinionPickClarify(lang: ReplyLanguage): string {
  return lang === 'ur'
    ? [
        '*NewsDash Analyst*',
        '',
        '*موضوع:* Dawn Opinion',
        'براہِ کرم نمبر لکھیں (جیسے 2) یا کالم کا عنوان تاکہ وہی Dawn Opinion کھول سکوں۔',
      ].join('\n')
    : [
        '*NewsDash Analyst*',
        '',
        '*Topic:* Dawn Opinion',
        'Reply with a number (e.g. 2) or paste the column title so I can open that Dawn Opinion piece.',
      ].join('\n');
}

/**
 * Resolve "2" / "read 2" / title fragment to a 0-based index.
 * Returns null if this is not a selection (e.g. "bbc news today").
 */
export function parseDawnOpinionSelection(
  q: string,
  items: Array<Pick<DawnOpinionItem, 'title'>>,
): number | null {
  if (!items.length) return null;
  const raw = String(q || '').trim();
  if (!raw || raw.length > 120) return null;

  // Other outlet / new topic — not a pick
  if (
    /\b(bbc|reuters|guardian|al\s*jazeera|bitcoin|weather|petrol|gold)\b/i.test(raw) &&
    !/^\d{1,2}\s*$/.test(raw) &&
    !/\bdawn\b/i.test(raw)
  ) {
    return null;
  }

  const englishIdx = parseEnglishOrdinalIndex(raw, items.length);
  if (englishIdx != null) return englishIdx;

  const numericIdx = parseNumericPickIndex(raw, items.length);
  if (numericIdx != null) return numericIdx;

  const urduOrdinal: Record<string, number> = {
    پہلا: 1,
    پہلی: 1,
    دوسرا: 2,
    دوسری: 2,
    تیسرا: 3,
    تیسری: 3,
    چوتھا: 4,
    پانچواں: 5,
    چھٹا: 6,
  };
  for (const [word, n] of Object.entries(urduOrdinal)) {
    if (raw.includes(word)) {
      const idx = n - 1;
      return idx >= 0 && idx < items.length ? idx : null;
    }
  }

  const needle = raw.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (needle.length < 4) return null;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < items.length; i++) {
    const title = String(items[i].title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) continue;
    if (title === needle || title.includes(needle) || needle.includes(title.slice(0, 40))) {
      const score = needle.length / Math.max(title.length, 1);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
  }
  return best >= 0 ? best : null;
}

export async function fetchDawnOpinionItems(
  limit = DAWN_OPINION_LIST_MAX,
): Promise<DawnOpinionItem[]> {
  try {
    const feed = await parser.parseURL(DAWN_OPINION_FEED_URL);
    const out: DawnOpinionItem[] = [];
    for (const item of feed.items || []) {
      if (out.length >= limit) break;
      const title = stripHtml(String(item.title || ''));
      const url = String(item.link || '').trim();
      if (!title || !/^https?:\/\//i.test(url)) continue;
      const publishedAt =
        extractValidDate(item as unknown as Record<string, unknown>) || undefined;
      if (publishedAt && !isFresh(publishedAt)) continue;
      const rawBody = stripHtml(
        String(
          (item as { contentSnippet?: string; content?: string; description?: string })
            .contentSnippet ||
            (item as { content?: string }).content ||
            (item as { description?: string }).description ||
            '',
        ),
      );
      const creator = sanitizeDawnAuthor(
        String(
          (item as { creator?: string; author?: string }).creator ||
            (item as { author?: string }).author ||
            '',
        ),
      );
      out.push({
        title,
        url,
        source: 'Dawn',
        publishedAt,
        body: rawBody.slice(0, 2000) || undefined,
        author: creator,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function dawnItemsToStoredSources(items: DawnOpinionItem[]): StoredSource[] {
  return items.map((i) => ({
    title: i.title,
    source: i.source,
    url: i.url,
    publishedAt: i.publishedAt,
    body: i.body,
  }));
}

export function buildDawnOpinionListReply(
  items: DawnOpinionItem[],
  lang: ReplyLanguage,
  formatLine: (item: DawnOpinionItem, idx: number) => string,
): string {
  if (!items.length) {
    return lang === 'ur'
      ? [
          '*NewsDash Analyst*',
          '',
          '*موضوع:* Dawn Opinion',
          'Dawn Opinion سیکشن سے ابھی کالم نہیں ملے۔ کچھ دیر بعد دوبارہ پوچھیں۔',
        ].join('\n')
      : [
          '*NewsDash Analyst*',
          '',
          '*Topic:* Dawn Opinion',
          'No Dawn Opinion pieces available from the feed right now. Try again shortly.',
        ].join('\n');
  }

  const header =
    lang === 'ur'
      ? [
          '*NewsDash Analyst*',
          '',
          '*موضوع:* Dawn Opinion',
          'Dawn Opinion کے موجودہ کالم — ایک چنیں:',
          '',
        ]
      : [
          '*NewsDash Analyst*',
          '',
          '*Topic:* Dawn Opinion',
          "Here are today’s Dawn Opinion pieces — pick one:",
          '',
        ];

  const lines = items.map((item, idx) => {
    const author = item.author ? ` — ${item.author}` : '';
    return `${idx + 1}. ${item.title}${author}`;
  });

  const prompt =
    lang === 'ur'
      ? ['', 'نمبر لکھیں (جیسے 2) یا عنوان لکھیں تاکہ وہ کالم کھولوں۔', '', '*ذرائع:*']
      : [
          '',
          'Reply with a number (e.g. 2) or the title to read that piece.',
          '',
          '*Sources*',
        ];

  const sources = items.map((item, idx) => formatLine(item, idx));
  return [...header, ...lines, ...prompt, ...sources].join('\n');
}

export function buildDawnOpinionPickBrief(item: DawnOpinionItem, lang: ReplyLanguage): string {
  const snippet = (item.body || '').replace(/\s+/g, ' ').trim().slice(0, 520);
  const when = item.publishedAt
    ? new Date(item.publishedAt).toLocaleString('en-PK', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Karachi',
      }) + ' PKT'
    : '';
  if (lang === 'ur') {
    return [
      `*${item.title}*`,
      item.author ? `مصنف: ${item.author}` : '',
      when ? `تاریخ: ${when}` : '',
      '',
      snippet
        ? `${snippet}${snippet.length >= 500 ? '…' : ''}`
        : 'اس کالم کا مختصر متن فیڈ میں دستیاب نہیں۔ لنک سے مکمل پڑھیں۔',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `*${item.title}*`,
    item.author ? `By ${item.author}` : '',
    when ? when : '',
    '',
    snippet
      ? `${snippet}${snippet.length >= 500 ? '…' : ''}`
      : 'Full column text is not in the feed snippet — open the source link to read it.',
  ]
    .filter(Boolean)
    .join('\n');
}
