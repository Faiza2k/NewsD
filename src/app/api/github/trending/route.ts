import { getCached, setCache } from '@/lib/feeds/cache';
import type { GithubRepo } from '@/types';

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const AI_TOPICS = [
  'machine-learning', 'deep-learning', 'artificial-intelligence', 'llm',
  'transformer', 'gpt', 'langchain', 'ai-agent', 'computer-vision',
  'natural-language-processing', 'reinforcement-learning', 'diffusion-model',
  'rag', 'vector-database', 'embedding', 'fine-tuning',
];

export const dynamic = 'force-dynamic';

export async function GET() {
  const cacheKey = 'github_v3:trending';
  const cached = getCached<GithubRepo[]>(cacheKey);

  if (cached) {
    return Response.json({
      repos: cached,
      lastUpdated: new Date().toISOString(),
    });
  }

  try {
    // Use GitHub Search API to find recently active, high-impact AI/ML repos
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().split('T')[0];

    // Search for deep innovation keywords in AI/ML, recently pushed, with significant stars
    const query = `llm OR agent OR rag OR transformer OR deep-learning OR machine-learning stars:>1000 pushed:>${sinceStr}`;

    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=20`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'NewsDash-Intelligence-Dashboard',
        },
        next: { revalidate: 900 },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();

    const repos: GithubRepo[] = (data.items || []).map((repo: Record<string, unknown>) => ({
      id: repo.id as number,
      name: repo.name as string,
      full_name: repo.full_name as string,
      description: (repo.description as string) || 'No description provided',
      html_url: repo.html_url as string,
      language: (repo.language as string) || 'Unknown',
      stargazers_count: repo.stargazers_count as number,
      forks_count: repo.forks_count as number,
      owner: {
        login: (repo.owner as Record<string, unknown>).login as string,
        avatar_url: (repo.owner as Record<string, unknown>).avatar_url as string,
      },
      topics: (repo.topics as string[]) || [],
      created_at: repo.created_at as string,
      updated_at: repo.updated_at as string,
    }));

    setCache(cacheKey, repos, CACHE_TTL);

    return Response.json({
      repos,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GitHub API] Error:', error);
    return Response.json({
      repos: [],
      lastUpdated: new Date().toISOString(),
      error: 'Failed to fetch GitHub trending repos',
    }, { status: 200 });
  }
}
