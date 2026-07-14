import { groqChat } from '@/lib/groq';

export type GroundedSource = {
  title: string;
  source: string;
  url: string;
  publishedAt?: string;
  body: string;
};

export type ReplyLanguage = 'en' | 'ur';

const ROMAN_URDU = new Set([
  'kya',
  'kyun',
  'kyunke',
  'hai',
  'hain',
  'tha',
  'thi',
  'the',
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
  'us',
  'bata',
  'btana',
  'bataona',
]);

/** Detect reply language from the user question (Urdu script, Roman Urdu, or English). */
export function detectQueryLanguage(text: string): ReplyLanguage {
  const t = String(text || '').trim();
  if (!t) return 'en';
  // Nastaliq / Arabic-script Urdu
  if (/[\u0600-\u06FF]/.test(t)) return 'ur';

  const tokens = t.toLowerCase().match(/[a-z']+/g) || [];
  if (!tokens.length) return 'en';
  const hits = tokens.filter((w) => ROMAN_URDU.has(w)).length;
  if (hits >= 2) return 'ur';
  if (hits >= 1 && tokens.length <= 8) return 'ur';
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

  return `You are NewsDash Analyst answering WhatsApp users.
Rules:
- Answer ONLY using the provided source texts. Do not invent facts, prices, quotes, or events.
- Directly answer the user's question in 4–8 short sentences, or a few short bullets if clearer.
- Prefer concrete facts (who/what/when/where/why) from the sources.
- Mention the publisher name(s) when stating key claims (e.g. "According to Reuters…" / "روئٹرز کے مطابق…").
- If the sources do not contain enough to answer, say clearly what is known and what is missing. Do not pad.
- Plain WhatsApp text only: no markdown headings, no code fences, no hashtags.
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

/** Groq grounded brief; returns null on failure / empty. */
export async function buildGroundedAnswer(
  question: string,
  sources: GroundedSource[],
  lang: ReplyLanguage = 'en',
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
    const text = await groqChat(
      [
        { role: 'system', content: systemPrompt(lang) },
        {
          role: 'user',
          content: `User question:\n${question.trim()}\n\nSources:\n${formatSources(usable)}${langHint}\n\nWrite the WhatsApp answer now.`,
        },
      ],
      { maxTokens: 650, temperature: 0.2 },
    );
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

/** Extractive fallback when Groq is unavailable — never invents. */
export function buildExtractiveAnswer(
  question: string,
  sources: GroundedSource[],
  lang: ReplyLanguage = 'en',
): string {
  if (!sources.length) {
    return lang === 'ur'
      ? 'اس سوال کے لیے اس وقت NewsDash میں کوئی مضبوط خبر نہیں ملی۔'
      : 'No matching NewsDash coverage found for that question right now.';
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
