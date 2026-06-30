import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

import { getCached, setCache } from '@/lib/feeds/cache';
import { FEED_SOURCES, CATEGORIES } from '@/lib/feeds/registry';
import { groqChat } from '@/lib/groq';
import Parser from 'rss-parser';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_ITEMS_PER_FEED = 5;
const BATCH_SIZE = 5;

const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'NewsDash/1.0 Intelligence Dashboard',
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
  },
});

export interface CategorySummary {
  category: string;
  categoryId: string;
  icon: string;
  gradient: string;
  summary: string;
  headlines: string[];
  generatedAt: string;
}

export interface SummaryResponse {
  summaries: CategorySummary[];
  generatedAt: string;
}

// Fetch top headlines for a category from RSS
async function fetchHeadlines(categoryId: string): Promise<string[]> {
  const sources = FEED_SOURCES.filter(s => s.category === categoryId).slice(0, 3);
  const titles: string[] = [];

  const allFetches = sources.map(async (source) => {
    try {
      const feed = await parser.parseURL(source.url);
      return (feed.items || [])
        .slice(0, MAX_ITEMS_PER_FEED)
        .map(item => item.title?.trim())
        .filter(Boolean) as string[];
    } catch {
      return [];
    }
  });

  const batches: string[][] = [];
  for (let i = 0; i < allFetches.length; i += BATCH_SIZE) {
    const results = await Promise.allSettled(allFetches.slice(i, i + BATCH_SIZE));
    for (const r of results) {
      if (r.status === 'fulfilled') batches.push(r.value);
    }
  }

  for (const batch of batches) titles.push(...batch);
  return titles.slice(0, 12); // max 12 headlines per category for the prompt
}

export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === '1';
  const cacheKey = 'ai-summary:overview:v1';

  if (!force) {
    const cached = getCached<SummaryResponse>(cacheKey);
    if (cached) return Response.json(cached);
  }

  // Gather headlines for each category in parallel (with concurrency)
  const categoryIds = CATEGORIES.map(c => c.id);
  const headlineMap: Record<string, string[]> = {};

  await Promise.allSettled(
    categoryIds.map(async (id) => {
      headlineMap[id] = await fetchHeadlines(id);
    })
  );

  // Build one consolidated prompt for all categories
  const sections = CATEGORIES.map(cat => {
    const headlines = headlineMap[cat.id];
    if (!headlines || headlines.length === 0) return null;
    return `ID: "${cat.id}"\nCategory: ${cat.name}\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`;
  }).filter(Boolean).join('\n\n');

  const prompt = `You are an expert intelligence analyst. Below are the latest headlines from each category in a real-time news dashboard.

For each category provided, write a 1–2 sentence sharp, insightful summary of what's happening right now based ONLY on its headlines. Be direct, factual, and analytical — no fluff. Only include the most significant trend or development.

Format your response as a JSON array where each object has a "categoryId" exactly matching the ID provided, and a "summary".

Example format:
[
  { "categoryId": "ai", "summary": "..." },
  { "categoryId": "crypto", "summary": "..." }
]

Headlines:

${sections}

Return ONLY valid JSON. No markdown fences or explanations.`;

  let summaries: CategorySummary[] = [];

  try {
    const raw = await groqChat([
      { role: 'system', content: 'You are a precise intelligence analyst. Respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ], { maxTokens: 1000, temperature: 0.2 });

    // Parse the JSON response
    const parsed: { categoryId: string; summary: string }[] = JSON.parse(raw);

    summaries = CATEGORIES.map(cat => {
      const found = parsed.find(p => p.categoryId === cat.id);
      return {
        category: cat.name,
        categoryId: cat.id,
        icon: cat.icon,
        gradient: cat.gradient,
        summary: found?.summary ?? 'Summary unavailable — check back shortly.',
        headlines: (headlineMap[cat.id] || []).slice(0, 3),
        generatedAt: new Date().toISOString(),
      };
    });
  } catch (err) {
    console.error('[Summary API] Groq error:', err);
    // Fallback: show top headlines as summary
    summaries = CATEGORIES.map(cat => ({
      category: cat.name,
      categoryId: cat.id,
      icon: cat.icon,
      gradient: cat.gradient,
      summary: 'AI summary temporarily unavailable. Showing latest headlines below.',
      headlines: (headlineMap[cat.id] || []).slice(0, 3),
      generatedAt: new Date().toISOString(),
    }));
  }

  const result: SummaryResponse = {
    summaries,
    generatedAt: new Date().toISOString(),
  };

  setCache(cacheKey, result, CACHE_TTL);
  return Response.json(result);
}
