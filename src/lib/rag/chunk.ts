import { createHash } from 'crypto';
import type { NewsItem } from '@/types';
import type { RagChunk, RagDocument } from '@/lib/rag/types';

const CHUNK_SIZE = 750;
const CHUNK_OVERLAP = 120;
const MAX_CHUNKS = 4;

export function normalizeArticleUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    // Drop common tracking params
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) u.searchParams.delete(key);
    }
    let path = u.pathname.replace(/\/+$/, '') || '/';
    // Strip trailing /amp
    path = path.replace(/\/amp$/i, '');
    u.pathname = path;
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
    return u.toString();
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

export function contentHash(parts: string[]): string {
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 24);
}

export function ragDocumentId(url: string): string {
  return `doc_${contentHash([normalizeArticleUrl(url)])}`;
}

export function toRagDocument(
  item: NewsItem,
  body?: string,
): RagDocument {
  const url = normalizeArticleUrl(item.url);
  const cleanBody = (body || '').replace(/\s+/g, ' ').trim();
  const description = (item.description || '').replace(/\s+/g, ' ').trim();
  return {
    // Stable across content updates so old chunk generations can be removed
    // with one vector-prefix delete before the replacement is upserted.
    id: ragDocumentId(url),
    url,
    title: item.title.trim(),
    source: item.source,
    category: item.category,
    subcategory: item.subcategory,
    publishedAt: item.publishedAt,
    description: description.slice(0, 500),
    body: cleanBody.slice(0, 12000) || undefined,
    contentHash: contentHash([url, item.title, description, cleanBody.slice(0, 4000)]),
    significance: item.significance,
    tags: item.tags || [],
  };
}

function windowChunks(text: string, size: number, overlap: number): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const out: string[] = [];
  let start = 0;
  while (start < t.length && out.length < MAX_CHUNKS - 1) {
    const end = Math.min(t.length, start + size);
    let slice = t.slice(start, end);
    if (end < t.length) {
      const stop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf(' '));
      if (stop > size * 0.45) slice = slice.slice(0, stop + 1);
    }
    out.push(slice.trim());
    if (end >= t.length) break;
    start = Math.max(0, start + slice.length - overlap);
  }
  return out.filter(Boolean);
}

/** Title+lede first, then overlapping body windows. Cap at MAX_CHUNKS. */
export function chunkDocument(doc: RagDocument): RagChunk[] {
  const lede = [doc.title, doc.description].filter(Boolean).join('. ').trim();
  const body = (doc.body || '').trim();
  const pieces: string[] = [];

  if (lede) pieces.push(lede.slice(0, CHUNK_SIZE));
  if (body && body !== doc.description) {
    for (const w of windowChunks(body, CHUNK_SIZE, CHUNK_OVERLAP)) {
      if (pieces.length >= MAX_CHUNKS) break;
      // Skip near-duplicate of lede
      if (pieces[0] && w.slice(0, 80) === pieces[0].slice(0, 80)) continue;
      pieces.push(w);
    }
  }
  if (!pieces.length) pieces.push(doc.title);

  return pieces.slice(0, MAX_CHUNKS).map((chunkText, chunkIndex) => ({
    id: `${doc.id}:${doc.contentHash}:${chunkIndex}`,
    documentId: doc.id,
    url: doc.url,
    title: doc.title,
    source: doc.source,
    category: doc.category,
    publishedAt: doc.publishedAt,
    significance: doc.significance,
    chunkIndex,
    chunkText,
    contentHash: doc.contentHash,
  }));
}

/** Infer information-need tag from a free-form question (topic-agnostic). */
export function inferNeedTag(question: string): import('@/lib/rag/types').RagNeedTag {
  const q = String(question || '').toLowerCase();
  if (/\b(why|reason|cause|kyun|wajah|because)\b/i.test(q)) return 'cause';
  if (/\b(will|recover|forecast|outlook|predict|happen next|future)\b/i.test(q)) return 'outlook';
  if (/\b(better|worse|vs|versus|compare|different|difference)\b/i.test(q)) return 'comparison';
  if (/\b(who|whose|built|made|author|company)\b/i.test(q)) return 'identity';
  if (/\b(should|how to|what (can|should|do)|fix|patch|mitigate)\b/i.test(q)) return 'instructions';
  if (/\b(when|timeline|date|how long|since)\b/i.test(q)) return 'timeline';
  if (/\b(impact|affect|matter|mean|implication)\b/i.test(q)) return 'impact';
  if (/\b(risk|danger|safe|unsafe|threat)\b/i.test(q)) return 'risk';
  return 'general';
}
