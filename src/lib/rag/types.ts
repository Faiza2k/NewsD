import type { Category } from '@/types';

/** Durable article record used for RAG indexing. */
export type RagDocument = {
  id: string;
  url: string;
  title: string;
  source: string;
  category: Category;
  subcategory?: string;
  publishedAt: string;
  description: string;
  body?: string;
  contentHash: string;
  significance: number;
  tags: string[];
  language?: string;
};

/** One searchable chunk stored in Upstash Vector. */
export type RagChunk = {
  id: string;
  documentId: string;
  url: string;
  title: string;
  source: string;
  category: Category;
  publishedAt: string;
  significance: number;
  chunkIndex: number;
  chunkText: string;
  contentHash: string;
};

export type RagNeedTag =
  | 'cause'
  | 'outlook'
  | 'comparison'
  | 'identity'
  | 'instructions'
  | 'timeline'
  | 'impact'
  | 'risk'
  | 'general';

export type HybridRetrieveFilters = {
  categories?: Category[];
  preferFreshHours?: number | null;
  excludeUrls?: Set<string>;
  mustMatch?: RegExp;
  topK?: number;
};

export type HybridHit = {
  id: string;
  url: string;
  title: string;
  source: string;
  category: Category;
  publishedAt: string;
  significance: number;
  chunkText: string;
  chunkIndex: number;
  hybridScore: number;
  lexicalScore?: number;
  matchedTerms?: string[];
};

export type RagStageMetrics = {
  requestId: string;
  stages: Record<string, number>;
  candidateCount?: number;
  vectorHit?: boolean;
  fallbackReason?: string;
  needTag?: RagNeedTag;
};
