import { GROQ_CLASSIFY_MODEL, GroqCallError, groqBudgetTight, groqChat } from '@/lib/groq';
import type { ConversationState } from '@/lib/query/conversation-state';
import { findTopicByHint } from '@/lib/query/conversation-state';
import { isIdentityAsk } from '@/lib/query/persona';
import type { ReplyLanguage } from '@/lib/query/grounded-answer';

export type TurnClassification =
  | { kind: 'small_talk'; suggestedReplyStyle: 'acknowledge' | 'playful' | 'brief' }
  | { kind: 'clarification_needed'; reason: string }
  | { kind: 'continue_topic'; topicId: string; effectiveQuery: string; wantsNewInfo: boolean }
  | { kind: 'new_topic'; effectiveQuery: string; displayLabel: string }
  | {
      kind: 'plugin';
      plugin: 'weather' | 'gold_price' | 'crypto_price' | 'fuel_price';
      effectiveQuery: string;
    }
  | { kind: 'translate_previous'; targetLang: ReplyLanguage };

export type ClassifyPathMeta = {
  path: 'llm' | 'heuristic' | 'fallback';
  reason?: string;
};

export type ClassifiedTurn = {
  classification: TurnClassification;
  meta: ClassifyPathMeta;
};

const SMALL_TALK_RE =
  /^(?:(?:haha+|hehe+|lol|lmao|lolz|nice|cool|great|awesome|thanks(?:\s+for\s+(?:the\s+)?(?:update|help|info|that))?|thank you(?:\s+for\s+(?:the\s+)?(?:update|help|info|that))?|thx|ty|ok|okay|k|kk|hmm+|wow|wild|damn|interesting|helpful|appreciate(?:\s+it)?|you(?:'re| are) (?:helpful|great|awesome|pretty helpful)|good (?:bot|job)|that's (?:a lot|wild|crazy|helpful|interesting)|thats (?:a lot|wild|crazy)|salam|assalamualaikum|👋|👍|🙏)[\s!,.]*)+$/i;

const SWITCH_CUE_RE =
  /\b(switching gears|switch(?:ing)? topics?|changing (?:topics?|subject)|one more thing|last one|unrelated|different topic|new topic|by the way|btw|alright[, ]+last)\b/i;

/** Full news/info questions that must never be "clarification_needed". */
function looksLikeClearNewsAsk(q: string): boolean {
  const s = q.trim();
  if (s.length < 12) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  if (
    /^(what about it|aur\??|or\??|and\??|uske bare mein|iske bare mein)\s*$/i.test(s)
  ) {
    return false;
  }
  return (
    /\b(what|who|when|where|why|how|latest|news|announce|announced|happening|update|situation|price|weather)\b/i.test(
      s,
    ) || /[\u0600-\u06FF]{4,}/.test(s)
  );
}

const ENTITY_CATALOG: Array<[RegExp, string, string]> = [
  [/\b(bitcoin|btc)\b/i, 'bitcoin', 'Bitcoin'],
  [/\b(ethereum|eth)\b/i, 'ethereum', 'Ethereum'],
  [/\b(solana|sol)\b/i, 'solana', 'Solana'],
  [/\b(gold|xau|sona)\b/i, 'gold', 'Gold'],
  [/\b(petrol|diesel|fuel|gasoline)\b/i, 'fuel', 'Petrol / fuel'],
  [/\b(iran)\b/i, 'iran', 'Iran'],
  [/\b(israel)\b/i, 'israel', 'Israel'],
  [/\b(ukraine)\b/i, 'ukraine', 'Ukraine'],
  [/\b(openai|chatgpt)\b/i, 'openai', 'OpenAI'],
  [/\b(dawn)\b/i, 'dawn', 'Dawn'],
  [/\b(bbc)\b/i, 'bbc', 'BBC'],
  [/\b(reuters)\b/i, 'reuters', 'Reuters'],
  [/\b(artificial intelligence)\b/i, 'ai', 'AI'],
  [/\bai\b/i, 'ai', 'AI'],
  [/\b(tesla)\b/i, 'tesla', 'Tesla'],
];

function extractTopicEntities(q: string): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const [re, id, label] of ENTITY_CATALOG) {
    if (re.test(q)) out.push({ id, label });
  }
  return out;
}

/**
 * Hard overrides the LLM cannot veto: explicit switches and clearly new entities
 * must open a new topic (or reactivate a prior matching topic).
 */
export function detectHardTopicShift(
  rawQ: string,
  state: ConversationState | null,
): TurnClassification | null {
  const q = String(rawQ || '').trim();
  if (!q) return null;

  const entities = extractTopicEntities(q);
  const switchCue = SWITCH_CUE_RE.test(q);
  const backCue = /\b(going back to|back to|remind me|earlier|we (?:said|talked|discussed))\b/i.test(q);

  // Reactivate a prior topic when the user names it explicitly with a back-reference.
  if (state?.topics?.length && entities.length && backCue) {
    for (const ent of entities) {
      const prior = state.topics.find(
        (t) =>
          t.id.includes(ent.id) ||
          t.label.toLowerCase().includes(ent.id) ||
          t.lastQ.toLowerCase().includes(ent.id),
      );
      if (prior) {
        return {
          kind: 'continue_topic',
          topicId: prior.id,
          effectiveQuery: `${prior.label}: ${q}`.slice(0, 400),
          wantsNewInfo: false,
        };
      }
    }
  }

  const active =
    (state?.activeTopicId && state.topics.find((t) => t.id === state.activeTopicId)) || undefined;
  const activeHay = active
    ? `${active.id} ${active.label} ${active.lastQ}`.toLowerCase()
    : '';
  const novel = entities.filter((e) => !activeHay.includes(e.id));

  if (switchCue || (novel.length > 0 && entities.length > 0)) {
    const focus = novel[0] || entities[0];
    const label = focus?.label || q.slice(0, 60);
    if (focus && /^(gold|bitcoin|ethereum|solana|fuel)$/.test(focus.id)) {
      if (
        /\b(price|rate|doing|worth|trading|keemat|climbing)\b/i.test(q) ||
        /^(what'?s|whats)\s+\w+\s+doing\??$/i.test(q.trim())
      ) {
        if (focus.id === 'gold') {
          return { kind: 'plugin', plugin: 'gold_price', effectiveQuery: 'gold price' };
        }
        if (focus.id === 'fuel') {
          return { kind: 'plugin', plugin: 'fuel_price', effectiveQuery: 'petrol price' };
        }
        return { kind: 'plugin', plugin: 'crypto_price', effectiveQuery: `${focus.label} price` };
      }
    }
    return {
      kind: 'new_topic',
      effectiveQuery: q.slice(0, 400),
      displayLabel: label.slice(0, 80),
    };
  }

  return null;
}

/**
 * Fast regex pre-check for obvious live-data plugins.
 * Returns null when the message needs conversational classification.
 */
export function detectObviousPlugin(
  q: string,
): Extract<TurnClassification, { kind: 'plugin' }> | null {
  const s = q.toLowerCase().trim();
  if (!s) return null;

  if (
    /^(weather|forecast|temperature|humidity)$/.test(s) ||
    (/\b(weather|forecast|temperature|humidity|mosam|mosaam|موسم)\b/.test(s) &&
      !/\b(news|price|bitcoin|gold)\b/.test(s))
  ) {
    return { kind: 'plugin', plugin: 'weather', effectiveQuery: q };
  }
  if (
    (/\b(gold|xau|sona|sone|sonay)\b/.test(s) || /سونا|سونے|گولڈ/.test(q)) &&
    (/\b(price|rate|keemat|qimat|qiymat|kimat|doing|قیمت|ریٹ)\b/.test(s) || /قیمت|ریٹ|پرائز/.test(q))
  ) {
    return { kind: 'plugin', plugin: 'gold_price', effectiveQuery: q };
  }
  if (
    (/\b(bitcoin|btc|ethereum|eth|solana|sol)\b/.test(s) || /بٹ\s*کوائن|بٹکوائن|ایتھیریم/.test(q)) &&
    (/\b(price|rate|keemat|qimat|how much|worth|doing|climbing)\b/.test(s) || /قیمت|ریٹ|پرائز/.test(q))
  ) {
    return { kind: 'plugin', plugin: 'crypto_price', effectiveQuery: q };
  }
  if (
    (/\b(petrol|diesel|fuel|gasoline)\b/.test(s) || /پیٹرول|پٹرول|ڈیزل/.test(q)) &&
    (/\b(price|rate|keemat|doing)\b/.test(s) || /قیمت|ریٹ/.test(q))
  ) {
    return { kind: 'plugin', plugin: 'fuel_price', effectiveQuery: q };
  }
  return null;
}

/** Heuristic small-talk / reaction with no information need (non-LLM fallback). */
export function isSmallTalkHeuristic(q: string): boolean {
  const s = String(q || '').trim();
  if (!s || s.length > 100) return false;
  if (isIdentityAsk(s)) return true;
  if (SMALL_TALK_RE.test(s)) return true;
  if (
    /^(lol|lmao|haha+|hehe+|damn|wow|wild)\b/i.test(s) &&
    !/\b(bitcoin|btc|gold|iran|ukraine|ai|openai|price|news|latest|what|who|when|where|why|how)\b/i.test(
      s,
    ) &&
    s.split(/\s+/).length <= 8
  ) {
    return true;
  }
  return false;
}

function compactTopics(state: ConversationState | null): string {
  if (!state?.topics?.length) return '(none)';
  return state.topics
    .slice(0, 5)
    .map((t) => `- id=${t.id} | label="${t.label}" | lastQ="${t.lastQ.slice(0, 80)}"`)
    .join('\n');
}

function compactTurns(state: ConversationState | null): string {
  if (!state?.recentTurns?.length) return '(none)';
  return state.recentTurns
    .slice(-6)
    .map((t) => `${t.role}: ${t.text.slice(0, 160)}`)
    .join('\n');
}

function parseClassification(raw: string, state: ConversationState | null): TurnClassification | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const kind = String(parsed.kind || '');

  if (kind === 'small_talk') {
    const style = String(parsed.suggestedReplyStyle || 'acknowledge');
    const suggestedReplyStyle =
      style === 'playful' || style === 'brief' ? style : 'acknowledge';
    return { kind: 'small_talk', suggestedReplyStyle };
  }
  if (kind === 'clarification_needed') {
    return {
      kind: 'clarification_needed',
      reason: String(parsed.reason || 'Need a clearer question').slice(0, 240),
    };
  }
  if (kind === 'continue_topic') {
    const topicId = String(parsed.topicId || '').trim();
    const effectiveQuery = String(parsed.effectiveQuery || '').trim();
    if (!topicId || effectiveQuery.length < 2) return null;
    const topic = state ? findTopicByHint(state, topicId) : null;
    return {
      kind: 'continue_topic',
      topicId: topic?.id || topicId,
      effectiveQuery: effectiveQuery.slice(0, 400),
      wantsNewInfo: Boolean(parsed.wantsNewInfo),
    };
  }
  if (kind === 'new_topic') {
    const effectiveQuery = String(parsed.effectiveQuery || '').trim();
    const displayLabel = String(parsed.displayLabel || effectiveQuery).trim();
    if (effectiveQuery.length < 2) return null;
    return {
      kind: 'new_topic',
      effectiveQuery: effectiveQuery.slice(0, 400),
      displayLabel: displayLabel.slice(0, 80) || effectiveQuery.slice(0, 80),
    };
  }
  if (kind === 'plugin') {
    const plugin = String(parsed.plugin || '');
    if (
      plugin !== 'weather' &&
      plugin !== 'gold_price' &&
      plugin !== 'crypto_price' &&
      plugin !== 'fuel_price'
    ) {
      return null;
    }
    return {
      kind: 'plugin',
      plugin,
      effectiveQuery: String(parsed.effectiveQuery || '').trim().slice(0, 400) || String(parsed.plugin),
    };
  }
  if (kind === 'translate_previous') {
    const lang = String(parsed.targetLang || parsed.lang || '').toLowerCase();
    const targetLang: ReplyLanguage = lang.startsWith('ur') ? 'ur' : 'en';
    return { kind: 'translate_previous', targetLang };
  }
  return null;
}

/** Detect "say that in Urdu / translate to English" without LLM. */
export function detectTranslatePrevious(q: string): Extract<TurnClassification, { kind: 'translate_previous' }> | null {
  const s = String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  const hasUrdu = /\b(urdu)\b/.test(s) || /اردو/.test(q);
  const hasEnglish = /\b(english)\b/.test(s) || /انگریزی/.test(q);
  if (!hasUrdu && !hasEnglish) return null;
  if (hasUrdu && hasEnglish) return null;
  const translateCue =
    /\b(say|tell|write|translate|convert|repeat|explain|in|into|to|mein|mai|main|isy|isay|usay|usey|ise|isko|usko)\b/.test(
      s,
    ) || /اردو|انگریزی/.test(q);
  if (!translateCue) return null;
  // Reject if a clear new entity/news ask is also present
  if (
    /\b(news|price|bitcoin|gold|iran|ukraine|openai|tesla|weather)\b/i.test(s) &&
    !/\b(say|translate|in urdu|in english|urdu mai|urdu mein|isy|isay)\b/i.test(s)
  ) {
    return null;
  }
  return { kind: 'translate_previous', targetLang: hasUrdu ? 'ur' : 'en' };
}

/**
 * Non-LLM fallback when Groq is unavailable — demoted regex cascade entry points.
 * Must NOT sticky-pin to the previous live-price topic when the user switches.
 */
export function classifyTurnFallback(
  rawQ: string,
  state: ConversationState | null,
): TurnClassification {
  const translate = detectTranslatePrevious(rawQ);
  if (translate) return translate;
  const hard = detectHardTopicShift(rawQ, state);
  if (hard) return hard;
  const obvious = detectObviousPlugin(rawQ);
  if (obvious) return obvious;
  if (isSmallTalkHeuristic(rawQ)) {
    return { kind: 'small_talk', suggestedReplyStyle: 'acknowledge' };
  }
  // Explicit "anything on X / any recent X" with a novel entity → new topic
  const entities = extractTopicEntities(rawQ);
  const active =
    (state?.activeTopicId && state.topics.find((t) => t.id === state.activeTopicId)) || undefined;
  const activeHay = active ? `${active.id} ${active.label} ${active.lastQ}`.toLowerCase() : '';
  const novel = entities.filter((e) => !activeHay.includes(e.id));
  if (novel.length && /\b(anything|any|latest|news|update|situation|on|about)\b/i.test(rawQ)) {
    return {
      kind: 'new_topic',
      effectiveQuery: rawQ.trim().slice(0, 400),
      displayLabel: novel[0].label,
    };
  }
  if (SWITCH_CUE_RE.test(rawQ)) {
    return {
      kind: 'new_topic',
      effectiveQuery: rawQ.trim().slice(0, 400),
      displayLabel: (novel[0]?.label || rawQ.trim()).slice(0, 60),
    };
  }
  if (state?.activeTopicId && state.topics.length && novel.length === 0) {
    const topic = active || state.topics[0];
    if (rawQ.trim().split(/\s+/).length <= 8 || /^(and|also|what about|does that|how about)\b/i.test(rawQ)) {
      const hint = findTopicByHint(state, rawQ);
      if (hint) {
        return {
          kind: 'continue_topic',
          topicId: hint.id,
          effectiveQuery: `${hint.label}: ${rawQ}`.slice(0, 400),
          wantsNewInfo: /\b(more|other|else|new|latest|aur)\b/i.test(rawQ),
        };
      }
      return {
        kind: 'continue_topic',
        topicId: topic.id,
        effectiveQuery: `${topic.lastQ || topic.label}. User follow-up: ${rawQ}`.slice(0, 400),
        wantsNewInfo: false,
      };
    }
  }
  return {
    kind: 'new_topic',
    effectiveQuery: rawQ.trim().slice(0, 400),
    displayLabel: rawQ.trim().slice(0, 60),
  };
}

function wrap(classification: TurnClassification, meta: ClassifyPathMeta): ClassifiedTurn {
  return { classification, meta };
}

/**
 * One LLM call decides conversational routing for this turn.
 * Heuristics run ONLY when Groq is unavailable / budget-tight / invalid JSON —
 * users phrase things infinitely many ways; keyword lists cannot scale.
 * Uses the cheap classify model to preserve grounding TPD headroom.
 */
export async function classifyTurn(
  rawQ: string,
  state: ConversationState | null,
): Promise<ClassifiedTurn> {
  const q = String(rawQ || '').trim();
  if (!q) {
    return wrap({ kind: 'clarification_needed', reason: 'Empty message' }, { path: 'heuristic', reason: 'empty' });
  }

  // Fast-path ONLY for unambiguous live quotes (bitcoin price / gold price) —
  // still cheap and language-agnostic enough via detectObviousPlugin.
  // Everything conversational (translate, more, switches, abstract topics) goes to the LLM.
  const obvious = detectObviousPlugin(q);
  if (obvious && /^(gold|bitcoin|btc|ethereum|eth|weather|mosam)\b/i.test(q.replace(/[^a-z0-9\s]/gi, ' ').trim())) {
    return wrap(obvious, { path: 'heuristic', reason: 'obvious_plugin' });
  }

  if (!process.env.GROQ_API_KEY) {
    return wrap(classifyTurnFallback(q, state), { path: 'fallback', reason: 'no_groq_key' });
  }
  if (groqBudgetTight()) {
    return wrap(classifyTurnFallback(q, state), { path: 'fallback', reason: 'budget_tight' });
  }

  try {
    const text = await groqChat(
      [
        {
          role: 'system',
          content: `You route messages for a bilingual (English + Urdu / Roman-Urdu) news & markets assistant.
Understand INTENT from meaning — do not require exact English keywords. Users invent spellings freely.

Kinds:
- small_talk: greeting, thanks, reaction, identity about the bot, no information need
- translate_previous: user wants the PREVIOUS answer restated in another language (Urdu or English), in ANY phrasing/script/spelling — e.g. "say that in Urdu", "isy urdu mai", "اردو میں", "urdu mein batao", "in english please". targetLang=ur|en
- clarification_needed: ONLY bare underspecified follow-ups with no clear ask (e.g. lone "what about it?" with no prior topic). NEVER for a full news question, even obscure/fictional
- continue_topic: follows an open topic. Set wantsNewInfo=true when they want ADDITIONAL / other / more coverage (not a rewrite of the same facts). Set wantsNewInfo=false only when they deepen the SAME answer (why/how/who about what was just said)
- new_topic: genuinely new subject or explicit switch. Write effectiveQuery as good English NEWS SEARCH keywords (expand abstract ideas yourself: "macroeconomic news" → inflation GDP trade rates fed markets). displayLabel = short Title Case topic, NEVER the raw translate command
- plugin: live weather / gold / crypto / fuel price ask in any language

Return ONLY valid JSON matching one of:
{"kind":"small_talk","suggestedReplyStyle":"acknowledge"|"playful"|"brief"}
{"kind":"clarification_needed","reason":"..."}
{"kind":"continue_topic","topicId":"...","effectiveQuery":"...","wantsNewInfo":true|false}
{"kind":"new_topic","effectiveQuery":"...","displayLabel":"..."}
{"kind":"plugin","plugin":"weather"|"gold_price"|"crypto_price"|"fuel_price","effectiveQuery":"..."}
{"kind":"translate_previous","targetLang":"ur"|"en"}
No markdown.`,
        },
        {
          role: 'user',
          content: [
            `Message: ${q}`,
            `Rolling summary: ${state?.rollingSummary || '(empty)'}`,
            `Recent turns:\n${compactTurns(state)}`,
            `Open topics:\n${compactTopics(state)}`,
            `Active topic id: ${state?.activeTopicId || '(none)'}`,
          ].join('\n\n'),
        },
      ],
      {
        model: GROQ_CLASSIFY_MODEL,
        maxTokens: 140,
        temperature: 0,
        retries: 0,
        skipIfBudgetTight: true,
      },
    );
    const parsed = parseClassification(text, state);
    if (parsed) {
      const veto = detectHardTopicShift(q, state);
      if (veto && parsed.kind === 'continue_topic') {
        return wrap(veto, { path: 'heuristic', reason: 'veto_continue_after_llm' });
      }
      if (
        parsed.kind === 'clarification_needed' &&
        looksLikeClearNewsAsk(q) &&
        !(state?.topics?.length)
      ) {
        return wrap(
          {
            kind: 'new_topic',
            effectiveQuery: q.slice(0, 400),
            displayLabel: q.replace(/[?!.,]+$/g, '').trim().slice(0, 60) || 'News',
          },
          { path: 'heuristic', reason: 'veto_clarify_clear_ask' },
        );
      }
      return wrap(parsed, { path: 'llm' });
    }
    return wrap(classifyTurnFallback(q, state), { path: 'fallback', reason: 'invalid_json' });
  } catch (err) {
    const reason =
      err instanceof GroqCallError
        ? err.code
        : err instanceof Error && /429/.test(err.message)
          ? '429'
          : 'llm_error';
    console.warn('[classify_turn] LLM failed, using fallback', reason, err instanceof Error ? err.message : err);
    return wrap(classifyTurnFallback(q, state), { path: 'fallback', reason });
  }
}
