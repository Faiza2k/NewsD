import { groqChat } from '@/lib/groq';

export type GroundedSource = {
  title: string;
  source: string;
  url: string;
  publishedAt?: string;
  body: string;
};

const SYSTEM = `You are NewsDash Analyst answering WhatsApp users.
Rules:
- Answer ONLY using the provided source texts. Do not invent facts, prices, quotes, or events.
- Directly answer the user's question in 4–8 short sentences, or a few short bullets if clearer.
- Prefer concrete facts (who/what/when/where/why) from the sources.
- Mention the publisher name(s) when stating key claims (e.g. "According to Reuters…").
- If the sources do not contain enough to answer, say clearly what is known and what is missing. Do not pad.
- Plain WhatsApp text only: no markdown headings, no code fences, no hashtags.
- Do not tell the user to open the link as the main answer; the brief itself must be useful.`;

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
): Promise<string | null> {
  if (!question.trim() || !sources.length) return null;
  if (!process.env.GROQ_API_KEY) return null;

  const usable = sources.filter((s) => (s.body || s.title).trim().length > 0);
  if (!usable.length) return null;

  try {
    const text = await groqChat(
      [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `User question:\n${question.trim()}\n\nSources:\n${formatSources(usable)}\n\nWrite the WhatsApp answer now.`,
        },
      ],
      { maxTokens: 550, temperature: 0.2 },
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
): string {
  if (!sources.length) {
    return 'No matching NewsDash coverage found for that question right now.';
  }

  const parts: string[] = [];
  for (const s of sources.slice(0, 2)) {
    let body = (s.body || '').replace(/\s+/g, ' ').trim();
    // Drop obvious chrome / ticker dumps
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
    parts.push(`According to ${s.source}: ${snippet}`);
  }

  return parts.join('\n\n').trim();
}
