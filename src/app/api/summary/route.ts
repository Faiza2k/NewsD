import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

import { getCached, setCache } from '@/lib/feeds/cache';
import { FEED_SOURCES, CATEGORIES } from '@/lib/feeds/registry';
import { groqChat } from '@/lib/groq';
import Parser from 'rss-parser';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_ITEMS_PER_FEED = 8;
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
  const sources = FEED_SOURCES.filter(s => s.category === categoryId); // ALL sources, not just 3
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
  return titles.slice(0, 20); // max 20 headlines per category for comprehensive coverage
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

  // Build one consolidated prompt for all categories — include ALL categories even if no headlines
  const sections = CATEGORIES.map(cat => {
    const headlines = headlineMap[cat.id] || [];
    if (headlines.length === 0) {
      return `ID: "${cat.id}"\nCategory: ${cat.name}\n(No headlines fetched — provide a general summary based on your knowledge of current trends in this domain.)`;
    }
    return `ID: "${cat.id}"\nCategory: ${cat.name}\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`;
  }).join('\n\n');

  const prompt = `You are an expert intelligence analyst. Below are the latest headlines from each category in a real-time news dashboard.

For each category provided, write a 2–3 sentence sharp, insightful summary of what's happening right now based ONLY on its headlines. Be direct, factual, and analytical. Cover the most significant trends and developments — do not skip any important story.

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
  let aiSuccess = false;

  // Check if we have any headlines at all
  const totalHeadlines = Object.values(headlineMap).reduce((sum, h) => sum + h.length, 0);

  if (totalHeadlines === 0) {
    console.warn('[Summary API] No headlines fetched from any RSS feed');
  }

  if (sections.trim().length > 0) {
    try {
      const raw = await groqChat([
        { role: 'system', content: 'You are a precise intelligence analyst. Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ], { maxTokens: 2000, temperature: 0.2 });

      // Strip markdown code fences if present
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      // Parse the JSON response
      const parsed: { categoryId: string; summary: string }[] = JSON.parse(cleaned);

      summaries = CATEGORIES.map(cat => {
        const found = parsed.find(p => p.categoryId === cat.id);
        const headlines = headlineMap[cat.id] || [];
        return {
          category: cat.name,
          categoryId: cat.id,
          icon: cat.icon,
          gradient: cat.gradient,
          summary: found?.summary ?? `Latest in ${cat.name}: ${headlines.slice(0, 2).join(' | ') || 'No updates available.'}`,
          headlines: headlines.slice(0, 8),
          generatedAt: new Date().toISOString(),
        };
      });
      aiSuccess = true;
    } catch (err) {
      console.error('[Summary API] Groq error:', err);
    }
  }

  // Fallback: if AI failed, generate simple summaries from headlines
  if (!aiSuccess) {
    summaries = CATEGORIES.map(cat => {
      const headlines = headlineMap[cat.id] || [];
      return {
        category: cat.name,
        categoryId: cat.id,
        icon: cat.icon,
        gradient: cat.gradient,
        summary: headlines.length > 0
          ? `Top stories: ${headlines.slice(0, 3).join(' | ')}`
          : 'No headlines available for this category.',
        headlines: headlines.slice(0, 8),
        generatedAt: new Date().toISOString(),
      };
    });
  }

  const result: SummaryResponse = {
    summaries,
    generatedAt: new Date().toISOString(),
  };

  setCache(cacheKey, result, CACHE_TTL);
  return Response.json(result);
}
