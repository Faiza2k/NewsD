import { GROQ_CLASSIFY_MODEL, GroqCallError, groqChat } from '@/lib/groq';
import type { RagNeedTag } from '@/lib/rag/types';

export type GroundedSource = {
  title: string;
  source: string;
  url: string;
  publishedAt?: string;
  body: string;
};

export type ReplyLanguage = 'en' | 'ur';

/** Shared persona identity — keep in sync across /api/query and /api/ai/chat. */
export const NEWSDASH_IDENTITY = `You are the NewsDash Analyst — a knowledgeable, personable news and markets
assistant. You are talking with the same person over what may be a long,
ongoing conversation across many messages, not answering a one-off query.`;

export type ClaimCitation = {
  claim: string;
  sourceUrls: string[];
};

/** Detect LLM degeneration (e.g. "شعبہ " repeated 50×). */
export function isDegenerateRepetition(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 40) return false;
  // Same token repeated 8+ times in a row (Latin or Urdu).
  if (/([^\s]{2,})(?:\s+\1){7,}/u.test(t)) return true;
  // One token dominates the whole message.
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 20) {
    const counts = new Map<string, number>();
    for (const w of tokens) counts.set(w, (counts.get(w) || 0) + 1);
    let top = 0;
    for (const n of counts.values()) top = Math.max(top, n);
    if (top / tokens.length >= 0.35) return true;
  }
  return false;
}

const ROMAN_URDU_STRONG = new Set([
  'kya',
  'kyun',
  'kyunke',
  'hai',
  'hain',
  'tha',
  'thi',
  'ho',
  'hun',
  'main',
  'mein',
  'mujhe',
  'mujh',
  'mujhay',
  'hum',
  'aap',
  'tum',
  'batao',
  'bataen',
  'bataiye',
  'sunao',
  'sunaen',
  'chahiye',
  'chahye',
  'zaroor',
  'nahi',
  'nahin',
  'acha',
  'theek',
  'aaj',
  'aj',
  'kal',
  'keemat',
  'qimat',
  'qiymat',
  'khabar',
  'khabrein',
  'khabren',
  'khabarain',
  'halaat',
  'bata',
  'btana',
  'bataona',
]);

/** Short particles — only count with other Urdu signals (avoid "US", "the", etc.). */
const ROMAN_URDU_WEAK = new Set([
  'ke',
  'ki',
  'ka',
  'ko',
  'se',
  'par',
  'aur',
  'ya',
  'wo',
  'woh',
  'ye',
  'yeh',
  'iss',
]);

/** Detect reply language from the user question (Urdu script, Roman Urdu, or English). */
export function detectQueryLanguage(text: string): ReplyLanguage {
  const t = String(text || '').trim();
  if (!t) return 'en';
  // Nastaliq / Arabic-script Urdu
  if (/[\u0600-\u06FF]/.test(t)) return 'ur';

  const tokens = t.toLowerCase().match(/[a-z']+/g) || [];
  if (!tokens.length) return 'en';
  const strong = tokens.filter((w) => ROMAN_URDU_STRONG.has(w)).length;
  const weak = tokens.filter((w) => ROMAN_URDU_WEAK.has(w)).length;
  if (strong >= 1) return 'ur';
  if (strong + weak >= 2 && tokens.length <= 10) return 'ur';
  return 'en';
}

/** Pick reply language — prefer Urdu script, Roman Urdu, or Whisper `ur` hint for voice asks. */
export function resolveReplyLanguage(
  incomingQ: string,
  effectiveQ?: string,
  langHint?: string | null,
): ReplyLanguage {
  const inc = String(incomingQ || '').trim();
  const eff = String(effectiveQ || '').trim();

  // 1. If user explicitly wrote in Nastaliq Urdu script, reply in Urdu
  if (/[\u0600-\u06FF]/.test(inc) || /[\u0600-\u06FF]/.test(eff)) return 'ur';

  // 2. Detect language from current incoming query
  const detected = detectQueryLanguage(inc);

  // 3. If query contains clear English news markers with no Roman Urdu strong words, prioritize English
  const tokens = inc.toLowerCase().match(/[a-z']+/g) || [];
  const strongUrdu = tokens.filter((w) => ROMAN_URDU_STRONG.has(w)).length;
  const hasEnglishNewsWords = /\b(price|rate|weather|gold|bitcoin|petrol|diesel|oil|today|now|up|down|go|why|what|how|who|news|india|pakistan)\b/i.test(inc);
  
  if (hasEnglishNewsWords && strongUrdu === 0) {
    return 'en';
  }

  // 4. Otherwise, if it's a short/vague query (e.g. "or batao" / "more details"), fall back to the langHint/memory preference if available
  if (langHint) {
    const hint = String(langHint).toLowerCase().trim();
    if (hint === 'ur' || hint === 'urdu' || hint.startsWith('ur-')) return 'ur';
    if (hint === 'en' || hint === 'english') return 'en';
  }

  return detected;
}

function systemPrompt(lang: ReplyLanguage): string {
  const languageRule =
    lang === 'ur'
      ? `- Respond FULLY in Urdu (Nastaliq / Arabic script).
- Do NOT output any Chinese, Japanese, or other non-Urdu/non-English characters under any circumstances (e.g. do not write "安排وں" or "交通").
- If you need to write an English term, name, or concept that does not translate easily to Urdu, either write it in Urdu transliteration (e.g., "ٹریفک" or "ارینجمنٹس") or use the standard English word in Latin letters.
- Keep publisher names, product names, and place names in their original form when needed.
- Source titles stay as provided; you are only translating/adapting the answer narrative.`
      : `- Respond FULLY in English.`;

  return `${NEWSDASH_IDENTITY}

OBJECTIVES (in priority order)
1. Be accurate: never state a fact, price, quote, name, or event that is not
   supported by the sources you were given for this turn.
2. Be a good conversational partner: make the person want to keep talking to
   you, not just extract an answer and leave.
3. Be efficient: don't pad responses, but don't truncate them into a wire
   report either — match the reply's depth to what the moment calls for.

CONVERSATIONAL BEHAVIOR
- Treat this as a continuing relationship. Refer back naturally to things the
  person told you or asked about earlier in THIS conversation when relevant.
- Vary your structure and openings. Do not reuse the same header, section
  labels, or sentence pattern every message.
- When natural, end with a short, genuine follow-up question or offer — but
  not after every message; use judgment.
- Match the person's tone and formality.

MEMORY AND CONTEXT USAGE
- You will be given a running summary and recent turns. Use both. If
  something was already established earlier, don't ask again or contradict
  it.
- If your memory of this conversation is genuinely empty, say so plainly.

FOLLOW-UP AND CLARIFICATION STRATEGY
- Prefer a light, specific clarifying question over a generic one, using
  whatever you already know about the conversation to narrow it down.

UNCERTAINTY HANDLING (anti-hallucination — do not weaken these)
- Answer ONLY using the provided source texts. Do not invent facts, prices, quotes, or events.
- Always give a useful brief from the sources you have. Treat them as the best available coverage for the user's ask.
- Answer the CURRENT question directly; do not substitute a broad topic summary or repeat the previous answer.
- For predictions or outlooks, give only a conditional evidence-based assessment and name the supporting/negative signals. Never promise an outcome.
- If the evidence cannot establish the exact requested fact, say that briefly after the useful facts. Do not fill the gap with an unrelated article.
- Prefer concrete facts (who/what/when/where/numbers).
- Mention publisher name(s) on key claims (e.g. "According to Reuters…" / "روئٹرز کے مطابق…").
- NEVER invent specific product names, model/version numbers, company names, dates, or figures that are not written in the sources. If the user asks for a specific fact the sources do not state (e.g. "is it better than the previous one?"), summarize what the sources DO say about the topic and note in one short clause that the exact comparison/detail is not in today's coverage — do not fabricate it.
- NEVER assert that something did NOT happen or was NOT announced (e.g. "there are no layoffs today", "no new CVEs were found") — you only see a small slice of coverage. Report what the sources actually say instead.
- Do not open with a refusal. Lead with the useful facts from the sources; any "not covered" clause comes after, kept to a few words.

RESPONSE FORMATTING
- Plain conversational text. Light *bold* for key terms is fine; no forced
  "Topic / Answer / Sources" template every message — that structure is a
  LAST-RESORT fallback format only, not the default voice.
- Length should fit the moment: a quick reaction can be a sentence; a real
  news brief can be a short paragraph with 2-4 supporting points (~80–160 words for news briefs).
- Do not tell the user to open the link as the main answer; the brief itself must be useful.
- You may mention you are NewsDash Analyst naturally when it fits; do not start every reply with a rigid header.

LANGUAGE
- Match the person's established language (English or Urdu) unless they switch.
${languageRule}`;
}


function formatSources(sources: GroundedSource[]): string {
  return sources
    .map((s, i) => {
      const when = s.publishedAt ? `\nPublished: ${s.publishedAt}` : '';
      const body = (s.body || '').slice(0, 7000);
      return `SOURCE ${i + 1}
Publisher: ${s.source}
Title: ${s.title}
URL: ${s.url}${when}
Body:
${body || '(no body text)'}`;
    })
    .join('\n\n---\n\n');
}

/**
 * For Urdu-script asks, get English keywords so we can rank English RSS headlines.
 * Returns null when unused / unavailable.
 */
export async function englishSearchHints(question: string, lang: ReplyLanguage): Promise<string | null> {
  if (lang !== 'ur') return null;
  const latin = question.match(/[A-Za-z]{3,}/g) || [];
  if (latin.length >= 2) return null;
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const text = await groqChat(
      [
        {
          role: 'system',
          content:
            'Convert the user news question into 3-8 English search keywords for RSS headline matching. Reply with keywords only, separated by spaces. No punctuation, no sentences.',
        },
        { role: 'user', content: question.trim() },
      ],
      { maxTokens: 48, temperature: 0 },
    );
    const cleaned = text.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned.length >= 3 ? cleaned : null;
  } catch {
    return null;
  }
}

export type NewsQueryPlan = {
  searchQuery: string;
  displayTopic: string;
  preferFreshHours: number | null;
};

export type RelevanceCandidate = {
  title: string;
  description?: string;
  source?: string;
};

/**
 * Rewrite a natural-language ask into RSS search keywords + a clean topic label.
 * Falls back to null when Groq is unavailable.
 */
export async function planNewsQuery(question: string): Promise<NewsQueryPlan | null> {
  if (!question.trim() || !process.env.GROQ_API_KEY) return null;
  try {
    const text = await groqChat(
      [
        {
          role: 'system',
          content: `You rewrite conversational questions for RSS / vector news search.
Understand meaning in any language or spelling — do not depend on fixed synonym lists.
Return ONLY valid JSON with keys:
- searchQuery: 3-12 English keywords that would appear in real headlines for this information need. Expand abstract ideas yourself (macroeconomy → inflation GDP trade rates fed markets; new tech → AI chips startups model launch). Preserve cause/outlook/impact/comparison when asked.
- displayTopic: short Title Case label (2-6 words). Never use a translate command as the label.
- preferFreshHours: 6, 24, or 72 if the user wants latest/today/now; otherwise null
No markdown, no extra keys.`,
        },
        { role: 'user', content: question.trim() },
      ],
      { maxTokens: 120, temperature: 0 },
    );
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      searchQuery?: unknown;
      displayTopic?: unknown;
      preferFreshHours?: unknown;
    };
    const searchQuery = String(parsed.searchQuery || '')
      .replace(/[^\w\s+-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const displayTopic = String(parsed.displayTopic || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    let preferFreshHours: number | null = null;
    const fh = Number(parsed.preferFreshHours);
    if (fh === 6 || fh === 24 || fh === 72) preferFreshHours = fh;
    if (searchQuery.length < 2) return null;
    return {
      searchQuery,
      displayTopic: displayTopic || searchQuery,
      preferFreshHours,
    };
  } catch {
    return null;
  }
}

/**
 * Select evidence that answers the question, not merely articles mentioning
 * the same entity. This is deliberately topic-agnostic.
 */
export async function selectRelevantCandidateIndexes(
  question: string,
  candidates: RelevanceCandidate[],
  maxItems: number,
): Promise<number[] | null> {
  if (!question.trim() || !candidates.length || !process.env.GROQ_API_KEY) return null;
  const rows = candidates
    .map(
      (item, index) =>
        `[${index}] ${item.title}\n${String(item.description || '').replace(/\s+/g, ' ').slice(0, 500)}`,
    )
    .join('\n\n');
  const messages = [
    {
      role: 'system' as const,
      content: `You are a news relevance judge for a live-feeds assistant.
Pick candidates that help answer the user's CURRENT question.

Rules:
- Prefer articles that address the information need (what/why/outlook/impact/comparison/latest developments).
- For BROAD topic surveys ("latest macroeconomic news", "new technologies", "what's happening in markets"), accept articles that are clearly ON that theme even if they do not use the user's exact wording. Examples: tariffs/trade/fed/inflation/GDP count for macroeconomy; AI/chips/startups/model launches count for new tech.
- Reject only truly off-topic items (sports gossip for a macro ask, pure celebrity news for a tech ask, etc.).
- An article that merely name-drops an entity while being about something else is NOT enough for a SPECIFIC ask ("why did Bitcoin drop today?").
Return ONLY JSON: {"indexes":[ordered zero-based integer indexes]}.
Choose at most ${Math.max(1, maxItems)}. Return [] when none help. Never invent indexes.`,
    },
    { role: 'user' as const, content: `Question: ${question.trim()}\n\nCandidates:\n${rows}` },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await groqChat(messages, {
        model: GROQ_CLASSIFY_MODEL,
        maxTokens: 120,
        temperature: 0,
        retries: 0,
      });
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('invalid relevance response');
      const parsed = JSON.parse(match[0]) as { indexes?: unknown };
      if (!Array.isArray(parsed.indexes)) throw new Error('missing relevance indexes');
      return [
        ...new Set(
          parsed.indexes
            .map(Number)
            .filter((index) => Number.isInteger(index) && index >= 0 && index < candidates.length),
        ),
      ].slice(0, Math.max(1, maxItems));
    } catch {
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return null;
}

/**
 * Detect version-like tokens OR precise money/percentage figures in the answer
 * that appear in neither the sources nor the user's question.
 */
function fabricatedVersionTokens(
  answer: string,
  question: string,
  sources: GroundedSource[],
): string[] {
  const corpus = (
    question +
    ' ' +
    sources.map((s) => `${s.title} ${s.body || ''}`).join(' ')
  )
    .toLowerCase()
    .replace(/[\s\u200b\u200c\u200d\ufeff_-]+/g, '');
  const bad = new Set<string>();
  const re =
    /\b(gpt[\s-]?\d+(?:\.\d+)?[a-z]{0,6}|claude[\s-]?\d+(?:\.\d+)?|gemini[\s-]?\d+(?:\.\d+)?|llama[\s-]?\d+(?:\.\d+)?|grok[\s-]?\d+(?:\.\d+)?|(?:ios|android|windows|node|python|chrome|firefox)[\s-]?\d+\.\d+(?:\.\d+)?)\b/gi;
  for (const m of answer.matchAll(re)) {
    const norm = m[1].toLowerCase().replace(/[\s_-]+/g, '');
    if (!corpus.includes(norm)) bad.add(m[1]);
  }
  // Precise currency amounts / percentages not in sources.
  for (const m of answer.matchAll(/(?:\$|£|€|Rs\.?)\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+)\b/gi)) {
    const norm = m[0].toLowerCase().replace(/[\s,$]/g, '');
    if (!corpus.replace(/[,$]/g, '').includes(norm)) bad.add(m[0]);
  }
  for (const m of answer.matchAll(/\b\d+(?:\.\d+)?\s*(?:%|percent\b)/gi)) {
    const norm = m[0].toLowerCase().replace(/\s+/g, '');
    if (!corpus.replace(/\s+/g, '').includes(norm)) bad.add(m[0]);
  }
  return [...bad];
}

/**
 * Translate an existing answer into the target language, keeping names,
 * numbers, and URLs unchanged. Returns null when Groq is unavailable.
 */
export async function translateAnswerText(
  text: string,
  target: ReplyLanguage,
): Promise<string | null> {
  const t = String(text || '').trim();
  if (!t || !process.env.GROQ_API_KEY) return null;
  // Prefer the cheap classify model for translation — saves 70b TPD for grounding.
  const messages = [
    {
      role: 'system' as const,
      content:
        target === 'ur'
          ? `You are a professional Urdu translator. Translate the ENTIRE message into natural Urdu Nastaliq (Arabic script).
Rules:
- Every narrative sentence must be Urdu script — do NOT leave English sentences after colons.
- Keep publisher names, tickers, numbers, prices, and URLs in Latin as-is.
- Do not add or remove facts.
- Output ONLY the Urdu translation.`
          : 'Translate the user message into natural English. Keep publisher names, product names, numbers, prices, and URLs unchanged. Do not add or remove facts. Output ONLY the translation.',
    },
    { role: 'user' as const, content: t.slice(0, 2400) },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await groqChat(messages, {
        model: GROQ_CLASSIFY_MODEL,
        maxTokens: 900,
        temperature: 0,
        retries: 0,
      });
      const cleaned = out.trim();
      if (cleaned.length < 10) continue;
      if (isDegenerateRepetition(cleaned)) {
        console.warn('[translate] rejected degenerate repetition');
        continue;
      }
      const urduChars = (cleaned.match(/[\u0600-\u06FF]/g) || []).length;
      const latinWords = (cleaned.match(/[A-Za-z]{3,}/g) || []).length;
      if (target === 'ur') {
        // Accept when there is real Nastaliq content (publisher names may stay Latin).
        if (urduChars >= 20) return cleaned;
      } else if (!/[\u0600-\u06FF]/.test(cleaned) || latinWords >= 8) {
        return cleaned;
      }
    } catch {
      // retry after a short pause (rate limits)
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

export type GroundingResult = {
  answer: string | null;
  path: 'llm' | 'fallback' | 'extractive' | 'skipped';
  reason?: string;
};

/** Groq grounded brief; returns null answer on failure / empty. */
export async function buildGroundedAnswer(
  question: string,
  sources: GroundedSource[],
  lang: ReplyLanguage = 'en',
  history?: Array<{ role?: string; text?: string; content?: string }>,
  opts?: {
    /** Previous answer — set for "explain more": demand NEW depth, no repetition. */
    previousAnswer?: string;
    /** The literal follow-up the user typed ("explain the risk"). */
    focusAsk?: string;
    /** Information need identified before retrieval. */
    needTag?: RagNeedTag;
    /** Rolling summary of older conversation turns. */
    rollingSummary?: string;
  },
): Promise<string | null> {
  const result = await buildGroundedAnswerWithPath(question, sources, lang, history, opts);
  return result.answer;
}

export async function buildGroundedAnswerWithPath(
  question: string,
  sources: GroundedSource[],
  lang: ReplyLanguage = 'en',
  history?: Array<{ role?: string; text?: string; content?: string }>,
  opts?: {
    previousAnswer?: string;
    focusAsk?: string;
    needTag?: RagNeedTag;
    rollingSummary?: string;
  },
): Promise<GroundingResult> {
  if (!question.trim() || !sources.length) {
    console.warn('[grounding] skipped', { reason: 'empty_question_or_sources' });
    return { answer: null, path: 'skipped', reason: 'empty_question_or_sources' };
  }
  if (!process.env.GROQ_API_KEY) {
    console.warn('[grounding] skipped', { reason: 'no_groq_key' });
    return { answer: null, path: 'skipped', reason: 'no_groq_key' };
  }
  // Do NOT soft on soft TPD budget here — grounding is the primary user-facing
  // call. Soft budget only gates optional classify/summarize via skipIfBudgetTight.

  const usable = sources.filter((s) => (s.body || s.title).trim().length > 0);
  if (!usable.length) {
    console.warn('[grounding] skipped', { reason: 'no_usable_source_bodies' });
    return { answer: null, path: 'skipped', reason: 'no_usable_source_bodies' };
  }

  const langHint =
    lang === 'ur'
      ? '\n\nIMPORTANT: Write the entire WhatsApp answer in Urdu (Nastaliq). Sources above may be English — translate the meaning; do not leave the answer in English.'
      : '\n\nIMPORTANT: Write the entire WhatsApp answer in English.';

  const makeMessages = () => {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt(lang) },
    ];

    if (history && history.length > 0) {
      for (const turn of history) {
        const role = turn.role === 'user' ? 'user' : 'assistant';
        const txt = (turn.text || turn.content || '').trim();
        if (txt) {
          messages.push({ role, content: txt });
        }
      }
    }

    const elaborateBlock = opts?.previousAnswer
      ? `\n\nThe user ALREADY received this answer:\n"""${opts.previousAnswer.slice(0, 1500)}"""\nTheir CURRENT question is: "${(opts.focusAsk || question).slice(0, 160)}". Answer that exact question first. Use new source details when available and do not merely repeat the previous answer. If the evidence does not establish the requested fact or outcome, state that precisely instead of substituting a general summary.`
      : '';

    const summaryBlock = opts?.rollingSummary?.trim()
      ? `\n\nConversation so far (background summary — not literal recent dialogue):\n${opts.rollingSummary.trim().slice(0, 800)}`
      : '';

    messages.push({
      role: 'user',
      content: `CURRENT user question:\n${question.trim()}\nInformation need: ${opts?.needTag || 'general'}${summaryBlock}\n\nSources:\n${formatSources(usable)}${elaborateBlock}${langHint}\n\nWrite a natural conversational answer now. Use only the evidence above. Do not force a Topic/Answer/Sources template.`,
    });
    return messages;
  };

  let lastReason = 'all_attempts_failed';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await groqChat(makeMessages(), {
        maxTokens: 700,
        temperature: 0.1,
        retries: 0,
        skipIfBudgetTight: true,
      });
      const cleaned = text
        .replace(/^```[\s\S]*?```$/g, '')
        .replace(/^["']|["']$/g, '')
        .trim();
      if (!cleaned || cleaned.length < 20) {
        console.warn('[grounding] rejected', { reason: 'too_short', attempt });
        lastReason = 'too_short';
        continue;
      }
      if (isDegenerateRepetition(cleaned)) {
        console.warn('[grounding] rejected', { reason: 'degenerate_repetition', attempt });
        lastReason = 'degenerate_repetition';
        continue;
      }
      const fabricated = fabricatedVersionTokens(cleaned, question, usable);
      if (fabricated.length) {
        console.warn('[grounding] rejected', { reason: 'fabricated_tokens', fabricated, attempt });
        lastReason = 'fabricated_tokens';
        continue;
      }
      console.info('[grounding] path=llm');
      return { answer: cleaned, path: 'llm' };
    } catch (err) {
      const reason =
        err instanceof GroqCallError
          ? err.code
          : err instanceof Error && /429/.test(err.message)
            ? '429'
            : 'llm_error';
      lastReason = reason;
      console.warn('[grounding] groq_failed', { attempt, reason, error: err instanceof Error ? err.message : String(err) });
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.warn('[grounding] null_result', { reason: lastReason });
  return { answer: null, path: 'skipped', reason: lastReason };
}

/**
 * Short conversational reply for small-talk / clarification — no source grounding.
 */
export async function buildConversationalReply(
  rawQ: string,
  opts: {
    lang: ReplyLanguage;
    style?: 'acknowledge' | 'playful' | 'brief';
    rollingSummary?: string;
    recentTurns?: Array<{ role: string; text: string }>;
    mode?: 'small_talk' | 'clarification';
    clarifyReason?: string;
  },
): Promise<string | null> {
  const q = String(rawQ || '').trim();
  if (!q) return null;

  const fallback =
    opts.mode === 'clarification'
      ? opts.lang === 'ur'
        ? 'کیا آپ پہلے والے موضوع کے بارے میں پوچھ رہے ہیں، یا کچھ نیا؟ تھوڑا واضح کر دیں تاکہ میں درست تلاش کر سکوں۔'
        : 'Are you asking about what we were just discussing, or something new? Give me a bit more detail so I can look it up.'
      : opts.lang === 'ur'
        ? 'خوشی ہوئی! خبریں، قیمتیں، یا موسم پوچھیں — میں یہاں ہوں۔'
        : "Glad you're here. Ask me about news, prices, or weather anytime.";

  if (!process.env.GROQ_API_KEY) return fallback;

  const style = opts.style || 'acknowledge';
  const turns = (opts.recentTurns || [])
    .slice(-4)
    .map((t) => `${t.role}: ${t.text.slice(0, 120)}`)
    .join('\n');

  try {
    const text = await groqChat(
      [
        {
          role: 'system',
          content: `${NEWSDASH_IDENTITY}

You are replying to a ${opts.mode === 'clarification' ? 'clarification' : 'small-talk / reaction'} turn.
Style: ${style}. Keep it short (1-3 sentences). No news search, no Sources section, no rigid Topic/Answer template.
Match language: ${opts.lang === 'ur' ? 'Urdu (Nastaliq)' : 'English'}.
If clarifying, ask one specific question using conversation context — never dump a generic menu of examples.`,
        },
        {
          role: 'user',
          content: [
            `User message: ${q}`,
            opts.rollingSummary ? `Conversation so far: ${opts.rollingSummary.slice(0, 500)}` : '',
            turns ? `Recent turns:\n${turns}` : '',
            opts.clarifyReason ? `Why clarification may help: ${opts.clarifyReason}` : '',
            'Reply:',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      { maxTokens: 150, temperature: 0.4, retries: 0 },
    );
    const cleaned = text.trim();
    return cleaned.length >= 3 ? cleaned.slice(0, 600) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Lightweight claim-to-source map for debugging/evaluation. This never creates
 * user-facing citations; it only links answer sentences to supporting sources
 * by publisher mention and token overlap.
 */
export function mapClaimsToSources(
  answer: string,
  sources: GroundedSource[],
): ClaimCitation[] {
  const sentences = String(answer || '')
    .split(/(?<=[.!?۔])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25)
    .slice(0, 8);

  return sentences.map((claim) => {
    const claimTokens = new Set(
      (claim.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).slice(0, 40),
    );
    const ranked = sources
      .map((source) => {
        const corpus = `${source.source} ${source.title} ${source.body}`.toLowerCase();
        const publisherMention = claim.toLowerCase().includes(source.source.toLowerCase()) ? 4 : 0;
        let overlap = 0;
        for (const token of claimTokens) if (corpus.includes(token)) overlap += 1;
        return { url: source.url, score: publisherMention + overlap };
      })
      .filter((row) => row.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    return { claim, sourceUrls: ranked.map((row) => row.url) };
  });
}

/** True when the model hedged instead of giving a useful brief. */
export function isWeakGroundedAnswer(answer: string): boolean {
  const t = String(answer || '').trim();
  if (t.length < 40) return true;
  const lower = t.toLowerCase();
  const hedge =
    /not available in the provided source|in the provided sources|there is no (information|news|data|coverage|mention)|no (information|news|coverage) (available|on|about)|does not (mention|provide|contain)|more information is needed|cannot (determine|answer|find)|insufficient (information|detail|data)|i (do not|don't) have (enough|sufficient)|could not find|no matching|اس سوال کا جواب (نہیں|نہيں)|کافی معلومات نہیں|کوئی معلومات نہیں|خبر نہیں ملی/.test(
      lower,
    );
  if (!hedge) return false;
  // Hedge dominates → weak even if a date appears once
  const sentences = t.split(/[.؟!]\s+/).filter(Boolean);
  const hedgeSentences = sentences.filter((s) =>
    /no information|not available|more information|cannot |insufficient|کوئی معلومات|کافی معلومات/i.test(s),
  ).length;
  if (hedgeSentences >= 1 && sentences.length <= 3) return true;
  const hasFactSignal = /\b(20\d{2}|\$\d|\d+%|\d+\s?(million|billion|km|usd|pkr))\b/i.test(t);
  return !hasFactSignal || hedgeSentences >= 2;
}

/** Extractive fallback when Groq is unavailable — never invents. */
export function buildExtractiveAnswer(
  question: string,
  sources: GroundedSource[],
  lang: ReplyLanguage = 'en',
): string {
  if (!sources.length) {
    return lang === 'ur'
      ? 'تازہ فیڈز سے منتخب کوریج بھیج رہا ہوں — ایک لمحے بعد دوبارہ پوچھیں اگر کچھ مخصوص چاہیے۔'
      : 'Serving the closest available live coverage from NewsDash feeds — ask again with a sharper keyword if you want a tighter match.';
  }

  const parts: string[] = [];
  for (const s of sources.slice(0, 2)) {
    let body = (s.body || '').replace(/\s+/g, ' ').trim();
    if (
      /\b(toggle mega menu|subscribe to newsletter|cookie policy)\b/i.test(body) ||
      /\b[A-Z][a-z]{2,8} \d{1,2}, 20\d{2},? \d{1,2}:\d{2} ?(AM|PM)\b/.test(body) ||
      (body.match(/\$\d/g) || []).length > 8
    ) {
      body = s.title;
    }
    let snippet = body;
    if (snippet.length > 420) {
      const cut = snippet.slice(0, 420);
      const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      snippet = (stop > 120 ? cut.slice(0, stop + 1) : cut).trim();
      if (!snippet.endsWith('.')) snippet += '…';
    }
    if (!snippet) snippet = s.title;
    // Avoid mixed-script: Urdu labels wrapping English bodies. Use neutral
    // publisher attribution that matches the snippet language.
    parts.push(`${s.source}: ${snippet}`);
  }

  if (lang === 'ur') {
    // Snippets are almost always English RSS — keep attribution Latin to avoid
    // Urdu-wrapper / English-body mixed script. Callers that need Urdu prose
    // must go through translateAnswerText / buildGroundedAnswer.
    return parts.join('\n\n').trim();
  }
  return parts.join('\n\n').trim();
}
