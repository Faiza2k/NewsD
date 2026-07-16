import { groqChat } from '@/lib/groq';

export type GroundedSource = {
  title: string;
  source: string;
  url: string;
  publishedAt?: string;
  body: string;
};

export type ReplyLanguage = 'en' | 'ur';

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
  if (/[\u0600-\u06FF]/.test(inc) || /[\u0600-\u06FF]/.test(eff)) return 'ur';

  const hint = String(langHint || '')
    .toLowerCase()
    .trim();
  if (hint === 'ur' || hint === 'urdu' || hint.startsWith('ur-')) return 'ur';

  if (detectQueryLanguage(inc) === 'ur' || detectQueryLanguage(eff) === 'ur') return 'ur';
  return 'en';
}

function systemPrompt(lang: ReplyLanguage): string {
  const languageRule =
    lang === 'ur'
      ? `- Respond FULLY in Urdu (Nastaliq / Arabic script preferred). If the user wrote Roman Urdu, you may reply in clear Nastaliq Urdu.
- Do NOT reply in English for the answer body.
- Keep publisher names, product names, and place names in their original form when needed.
- Source titles stay as provided; you are only translating/adapting the answer narrative.`
      : `- Respond FULLY in English.`;

  return `You are NewsDash Analyst — sharp, factual, WhatsApp-native.
Rules:
- Answer ONLY using the provided source texts. Do not invent facts, prices, quotes, or events.
- Always give a useful brief from the sources you have. Treat them as the best available coverage for the user's ask.
- Lead with a direct answer in the first 1–2 sentences. Then add 2–5 short supporting points.
- Prefer concrete facts (who/what/when/where/numbers). Keep ~80–160 words.
- Mention publisher name(s) on key claims (e.g. "According to Reuters…" / "روئٹرز کے مطابق…").
- NEVER say: "not available", "not provided", "not published", "no information", "more information is needed", "cannot find", or that sources do not answer. If the fit is loose, still summarize the closest relevant facts confidently.
- Plain WhatsApp text only: no markdown headings, no code fences, no hashtags. Light *bold* ok.
- Do not tell the user to open the link as the main answer; the brief itself must be useful.
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
          content: `You rewrite WhatsApp news questions for RSS headline search.
Return ONLY valid JSON with keys:
- searchQuery: 3-10 English keywords/entities that best match news headlines (no filler like what/happened/tell/me/today unless the entity itself needs them)
- displayTopic: short Title Case label for the reply header (2-6 words)
- preferFreshHours: number 6, 24, or 72 if the user wants latest/today/now; otherwise null
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

/** Groq grounded brief; returns null on failure / empty. */
export async function buildGroundedAnswer(
  question: string,
  sources: GroundedSource[],
  lang: ReplyLanguage = 'en',
  history?: Array<{ role?: string; text?: string; content?: string }>,
): Promise<string | null> {
  if (!question.trim() || !sources.length) return null;
  if (!process.env.GROQ_API_KEY) return null;

  const usable = sources.filter((s) => (s.body || s.title).trim().length > 0);
  if (!usable.length) return null;

  const langHint =
    lang === 'ur'
      ? '\n\nIMPORTANT: Write the entire WhatsApp answer in Urdu (Nastaliq). Sources above may be English — translate the meaning; do not leave the answer in English.'
      : '\n\nIMPORTANT: Write the entire WhatsApp answer in English.';

  try {
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

    messages.push({
      role: 'user',
      content: `User question:\n${question.trim()}\n\nSources:\n${formatSources(usable)}${langHint}\n\nWrite a sharp WhatsApp answer now. Always use these sources as the best available briefing. Never say information is missing, not published, or not provided.`,
    });

    const text = await groqChat(messages, { maxTokens: 700, temperature: 0.15 });
    const cleaned = text
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^```[\s\S]*?```$/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .trim();
    if (cleaned.length < 40) return null;
    return cleaned;
  } catch {
    return null;
  }
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
    parts.push(
      lang === 'ur'
        ? `${s.source} کے مطابق: ${snippet}`
        : `According to ${s.source}: ${snippet}`,
    );
  }

  return parts.join('\n\n').trim();
}
