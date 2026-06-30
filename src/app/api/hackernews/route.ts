import { getCached, setCache } from '@/lib/feeds/cache';
import type { HackerNewsStory } from '@/types';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const HN_API = 'https://hacker-news.firebaseio.com/v0';

const RELEVANCE_KEYWORDS = [
  'ai', 'gpt', 'llm', 'openai', 'anthropic', 'claude', 'gemini', 'machine learning',
  'deep learning', 'neural', 'transformer', 'crypto', 'bitcoin', 'ethereum',
  'blockchain', 'startup', 'vc', 'funding', 'open source', 'github',
  'rust', 'python', 'typescript', 'nvidia', 'gpu', 'chip', 'semiconductor',
  'quantum', 'robotics', 'autonomous', 'tesla', 'spacex', 'apple', 'google',
  'microsoft', 'meta', 'aws', 'cloud', 'api', 'developer', 'programming',
  'agent', 'rag', 'vector', 'embedding', 'fine-tuning', 'benchmark',
];

function isRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  return RELEVANCE_KEYWORDS.some(keyword => lower.includes(keyword));
}

export async function GET() {
  const cacheKey = 'hackernews:top';
  const cached = getCached<HackerNewsStory[]>(cacheKey);

  if (cached) {
    return Response.json({
      stories: cached,
      lastUpdated: new Date().toISOString(),
    });
  }

  try {
    // Fetch top story IDs
    const idsResponse = await fetch(`${HN_API}/topstories.json`, {
      next: { revalidate: 300 },
    });

    if (!idsResponse.ok) {
      throw new Error(`HN API error: ${idsResponse.status}`);
    }

    const ids: number[] = await idsResponse.json();
    const topIds = ids.slice(0, 60); // Fetch more to filter

    // Fetch story details in parallel batches
    const stories: HackerNewsStory[] = [];
    const batchSize = 10;

    for (let i = 0; i < topIds.length && stories.length < 30; i += batchSize) {
      const batch = topIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (id) => {
          const res = await fetch(`${HN_API}/item/${id}.json`);
          return res.json();
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const story = result.value as HackerNewsStory;
          if (story.title && (isRelevant(story.title) || story.score > 100)) {
            stories.push({
              id: story.id,
              title: story.title,
              url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
              score: story.score,
              by: story.by,
              time: story.time,
              descendants: story.descendants || 0,
              type: story.type,
            });
          }
        }
      }
    }

    // Sort by score
    stories.sort((a, b) => b.score - a.score);
    const topStories = stories.slice(0, 25);

    setCache(cacheKey, topStories, CACHE_TTL);

    return Response.json({
      stories: topStories,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[HN API] Error:', error);
    return Response.json({
      stories: [],
      lastUpdated: new Date().toISOString(),
      error: 'Failed to fetch HackerNews stories',
    }, { status: 200 });
  }
}
