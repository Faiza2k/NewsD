import type { NewsItem, Category } from '@/types';
import { inferNeedTag, normalizeArticleUrl } from '@/lib/rag/chunk';
import type { HybridHit, HybridRetrieveFilters, RagNeedTag } from '@/lib/rag/types';
import { getVectorIndex, isVectorConfigured } from '@/lib/rag/vector';
import { expandTopicQueryTokens } from '@/lib/query/topic-expand';

function freshnessBonus(iso: string, preferFreshHours?: number | null): number {
  if (!preferFreshHours) return 0;
  const ageMs = Date.now() - new Date(iso).getTime();
  const windowMs = preferFreshHours * 60 * 60 * 1000;
  if (Number.isNaN(ageMs) || ageMs < 0) return 0;
  if (ageMs <= windowMs) return 12;
  if (ageMs <= windowMs * 2) return 5;
  return 0;
}

function buildMetadataFilter(filters?: HybridRetrieveFilters): string | undefined {
  const parts: string[] = [];
  if (filters?.categories?.length) {
    const cats = filters.categories.map((c) => `'${c}'`).join(', ');
    parts.push(`category IN (${cats})`);
  }
  if (filters?.preferFreshHours) {
    const since = Date.now() - filters.preferFreshHours * 60 * 60 * 1000;
    parts.push(`publishedAtMs >= ${since}`);
  }
  return parts.length ? parts.join(' AND ') : undefined;
}

const GENERIC_HYBRID_TOKENS = new Set([
  'news', 'today', 'latest', 'update', 'updates', 'about', 'more', 'detail', 'details',
  'what', 'when', 'where', 'which', 'will', 'would', 'could', 'should', 'happen',
  'happened', 'happening', 'explain', 'explained', 'tell', 'give', 'show', 'know',
  'want', 'please', 'recent', 'recently', 'announced', 'announce', 'announcement',
  'this', 'that', 'there', 'question', 'follow', 'user', 'result', 'results',
  'reason', 'reasons', 'effect', 'effects', 'report', 'reports', 'record', 'story',
  'stories', 'coverage', 'batao', 'bataen', 'sunao', 'mazeed', 'khabrein', 'khabar',
]);

/** English/Roman tokens (≥4 chars) that actually carry the question's topic. */
export function meaningfulQueryTokens(question: string): string[] {
  return [
    ...new Set(
      (question.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter(
        (t) => !GENERIC_HYBRID_TOKENS.has(t),
      ),
    ),
  ].slice(0, 24);
}

type VectorMeta = {
  url?: string;
  title?: string;
  source?: string;
  category?: string;
  publishedAt?: string;
  significance?: number;
  chunkIndex?: number;
  chunkText?: string;
  documentId?: string;
};

/**
 * Query Upstash hybrid index with hosted text embeddings.
 * Returns article-level hits (best chunk per URL).
 */
export async function hybridRetrieve(
  question: string,
  filters?: HybridRetrieveFilters,
): Promise<{ hits: HybridHit[]; needTag: RagNeedTag; vectorHit: boolean }> {
  const needTag = inferNeedTag(question);
  if (!isVectorConfigured() || !question.trim()) {
    return { hits: [], needTag, vectorHit: false };
  }
  const index = getVectorIndex();
  if (!index) return { hits: [], needTag, vectorHit: false };

  const topK = Math.min(Math.max(filters?.topK ?? 16, 4), 24);
  try {
    const filter = buildMetadataFilter(filters);
    const excluded = new Set(
      [...(filters?.excludeUrls || [])].flatMap((url) => [url, normalizeArticleUrl(url)]),
    );
    const results = await index.query({
      data: question.trim().slice(0, 2000),
      topK,
      includeMetadata: true,
      includeData: true,
      filter,
    });

    const byUrl = new Map<string, HybridHit>();
    for (const row of results || []) {
      const meta = (row.metadata || {}) as VectorMeta;
      const url = String(meta.url || '');
      if (!url) continue;
      if (excluded.has(url) || excluded.has(normalizeArticleUrl(url))) continue;
      const title = String(meta.title || '');
      const chunkText = String(row.data || meta.chunkText || title);
      if (filters?.mustMatch) {
        const hay = `${title} ${chunkText}`;
        if (!filters.mustMatch.test(hay)) continue;
      }
      const publishedAt = String(meta.publishedAt || new Date().toISOString());
      const hybridScore =
        Number(row.score || 0) * 40 +
        freshnessBonus(publishedAt, filters?.preferFreshHours) +
        Math.min(3, Number(meta.significance || 5) / 3);

      const hit: HybridHit = {
        id: String(meta.documentId || row.id),
        url,
        title,
        source: String(meta.source || 'Publisher'),
        category: (meta.category || 'tech') as Category,
        publishedAt,
        significance: Number(meta.significance || 5),
        chunkText: chunkText.slice(0, 1200),
        chunkIndex: Number(meta.chunkIndex || 0),
        hybridScore,
        matchedTerms: ['hybrid'],
      };
      const prev = byUrl.get(url);
      if (!prev || hit.hybridScore > prev.hybridScore) byUrl.set(url, hit);
    }

    const ranked = [...byUrl.values()].sort((a, b) => b.hybridScore - a.hybridScore);
    // Upstash hybrid queries return RRF rank-fusion scores, not absolute
    // similarities — even a completely off-topic question produces a "top"
    // hit. Require overlap with topical tokens OR their concept expansions
    // (so "macroeconomic" can match "tariff"/"fed"/"inflation" headlines).
    const queryTokens = expandTopicQueryTokens(meaningfulQueryTokens(question));
    // Detailed questions (4+ topical tokens) must share at least two of them —
    // one incidental word ("festival results" matching "earnings results")
    // is not evidence. Abstract expansions inflate the token list, so keep
    // the bar at 1 whenever expansions dominate.
    const baseTokens = meaningfulQueryTokens(question);
    const requiredMatches = baseTokens.length >= 4 && queryTokens.length <= baseTokens.length + 2 ? 2 : 1;
    const hits = queryTokens.length
      ? ranked.filter((hit) => {
          const hay = `${hit.title} ${hit.chunkText}`.toLowerCase();
          const matched = queryTokens.filter(
            (t) => hay.includes(t) || (t.length >= 6 && hay.includes(t.slice(0, 5))),
          );
          return matched.length >= requiredMatches;
        })
      : ranked;
    return { hits, needTag, vectorHit: hits.length > 0 };
  } catch (err) {
    console.warn('[rag.retrieve] hybrid query failed', err instanceof Error ? err.message : err);
    return { hits: [], needTag, vectorHit: false };
  }
}

/** Fuse hybrid + lexical candidates with RRF-style merging. */
export function fuseHybridAndLexical(
  hybrid: HybridHit[],
  lexical: Array<NewsItem & { score?: number; matchScore?: number; matchedTerms?: string[] }>,
  limit: number,
  preferFreshHours?: number | null,
): Array<NewsItem & { score: number; matchScore: number; matchedTerms: string[]; description: string }> {
  const k = 60;
  const scores = new Map<
    string,
    {
      item: NewsItem;
      rrf: number;
      hybridScore: number;
      lexicalScore: number;
      matchedTerms: string[];
      description: string;
    }
  >();

  hybrid.forEach((h, idx) => {
    const rrf = 1 / (k + idx + 1);
    scores.set(h.url, {
      item: {
        id: h.id,
        title: h.title,
        description: h.chunkText.slice(0, 300),
        url: h.url,
        source: h.source,
        category: h.category,
        publishedAt: h.publishedAt,
        significance: h.significance,
        tags: [],
      },
      rrf,
      hybridScore: h.hybridScore,
      lexicalScore: 0,
      matchedTerms: h.matchedTerms || ['hybrid'],
      description: h.chunkText.slice(0, 400),
    });
  });

  lexical.forEach((item, idx) => {
    const rrf = 1 / (k + idx + 1);
    const prev = scores.get(item.url);
    if (prev) {
      prev.rrf += rrf;
      prev.lexicalScore = item.score || item.matchScore || 0;
      prev.matchedTerms = [
        ...new Set([...(prev.matchedTerms || []), ...((item.matchedTerms as string[]) || ['lexical'])]),
      ];
      if ((item.description || '').length > prev.description.length) {
        prev.description = item.description;
        prev.item.description = item.description;
      }
    } else {
      scores.set(item.url, {
        item,
        rrf,
        hybridScore: 0,
        lexicalScore: item.score || item.matchScore || 0,
        matchedTerms: (item.matchedTerms as string[]) || ['lexical'],
        description: item.description || item.title,
      });
    }
  });

  const ranked = [...scores.values()]
    .map((row) => {
      const bonus = freshnessBonus(row.item.publishedAt, preferFreshHours);
      const score = row.rrf * 100 + row.hybridScore * 0.35 + row.lexicalScore * 0.25 + bonus;
      return {
        ...row.item,
        description: row.description || row.item.description,
        score,
        matchScore: Math.max(row.hybridScore, row.lexicalScore, 8),
        matchedTerms: row.matchedTerms,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Avoid a single publisher monopolizing the evidence pack.
  const sourceCounts = new Map<string, number>();
  const diverse: typeof ranked = [];
  for (const item of ranked) {
    const key = item.source.toLowerCase();
    const count = sourceCounts.get(key) || 0;
    if (count >= 2) continue;
    sourceCounts.set(key, count + 1);
    diverse.push(item);
    if (diverse.length >= Math.max(limit * 3, limit)) break;
  }
  return diverse;
}
