import { generateId } from '@/lib/utils';
import type { NewsItem, Category } from '@/types';

// Keyword sets for relevance scoring per category
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  ai: [
    'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
    'llm', 'gpt', 'claude', 'gemini', 'transformer', 'diffusion', 'stable diffusion',
    'openai', 'anthropic', 'deepmind', 'hugging face', 'mistral', 'meta ai',
    'nvidia', 'ai model', 'fine-tuning', 'rlhf', 'benchmark', 'training',
    'inference', 'embedding', 'rag', 'vector', 'ai agent', 'copilot',
    'chatbot', 'generative ai', 'foundation model', 'multimodal', 'vision',
    'natural language', 'nlp', 'computer vision', 'reinforcement learning',
    'perplexity', 'xai', 'ai safety', 'alignment', 'superintelligence',
  ],
  crypto: [
    'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'xrp', 'bnb',
    'cryptocurrency', 'crypto', 'blockchain', 'defi', 'nft', 'web3',
    'binance', 'coinbase', 'etf', 'mining', 'staking', 'airdrop',
    'whale', 'on-chain', 'stablecoin', 'usdt', 'usdc', 'token',
    'decentralized', 'smart contract', 'cardano', 'avalanche', 'chainlink',
    'sui', 'aptos', 'layer 2', 'rollup', 'memecoin', 'regulation',
  ],
  trading: [
    'stock market', 'forex', 'commodity', 'futures', 'options', 'trading',
    'bull', 'bear', 'technical analysis', 'market cap', 'earnings',
    'fed', 'fomc', 'interest rate', 'inflation', 'cpi', 'gdp',
    'nasdaq', 'dow jones', 's&p 500', 'bond', 'yield', 'treasury',
    'ipo', 'etf approval', 'institutional', 'hedge fund', 'sentiment',
    'volatility', 'rally', 'correction', 'sell-off',
  ],
  github: [
    'github', 'open source', 'repository', 'git', 'pull request',
    'trending', 'stars', 'fork', 'developer', 'framework', 'library',
    'langchain', 'crewai', 'autogen', 'browser automation', 'mcp',
  ],
  tech: [
    'technology', 'google', 'apple', 'microsoft', 'nvidia', 'amd', 'intel',
    'tesla', 'spacex', 'amazon', 'meta', 'qualcomm', 'semiconductor',
    'chip', 'quantum', 'robotics', 'autonomous', 'cloud', 'edge',
    'hardware', 'product launch', '5g', '6g', 'ar', 'vr', 'mixed reality',
  ],
  research: [
    'research', 'paper', 'arxiv', 'study', 'findings', 'breakthrough',
    'publication', 'journal', 'peer review', 'experiment', 'methodology',
    'dataset', 'evaluation', 'state of the art', 'sota', 'preprint',
  ],
  startups: [
    'startup', 'funding', 'series a', 'series b', 'series c', 'seed round',
    'venture capital', 'vc', 'unicorn', 'valuation', 'ipo', 'acquisition',
    'y combinator', 'yc', 'accelerator', 'incubator', 'founder',
    'techcrunch', 'crunchbase',
  ],
  global: [
    'geopolitics', 'regulation', 'policy', 'sanction', 'trade war',
    'supply chain', 'semiconductor', 'tariff', 'ban', 'legislation',
    'eu', 'sec', 'fda', 'government', 'economy', 'recession',
  ],
};

// Source authority weighting (higher = more authoritative)
const SOURCE_AUTHORITY: Record<string, number> = {
  'OpenAI Blog': 10, 'Anthropic Blog': 10, 'Google AI Blog': 10,
  'DeepMind Blog': 10, 'NVIDIA Blog': 9, 'Hugging Face Blog': 9,
  'CoinDesk': 9, 'Cointelegraph': 8, 'The Block': 8,
  'Reuters Business': 10, 'Reuters World': 10,
  'TechCrunch': 9, 'The Verge': 8, 'Wired': 8,
  'MIT Tech Review AI': 9, 'VentureBeat AI': 7,
  'BBC Technology': 8, 'MarketWatch': 8,
  'arXiv AI': 9, 'arXiv ML': 9,
};

export function scoreRelevance(title: string, description: string, category: Category): number {
  const text = `${title} ${description}`.toLowerCase();
  const keywords = CATEGORY_KEYWORDS[category] || [];

  let keywordHits = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      keywordHits++;
    }
  }

  // Normalize: 0-1 range based on keyword matches
  const keywordScore = Math.min(keywordHits / 4, 1);

  return keywordScore;
}

export function scoreSignificance(
  title: string,
  description: string,
  source: string,
  publishedAt: string,
  category: Category,
): number {
  // Component 1: Keyword relevance (0-4 points)
  const relevance = scoreRelevance(title, description, category);
  const relevancePoints = relevance * 4;

  // Component 2: Source authority (0-3 points)
  const authority = SOURCE_AUTHORITY[source] || 5;
  const authorityPoints = (authority / 10) * 3;

  // Component 3: Recency boost (0-3 points)
  const age = Date.now() - new Date(publishedAt).getTime();
  const hourAge = age / (1000 * 60 * 60);
  let recencyPoints = 0;
  if (hourAge < 1) recencyPoints = 3;
  else if (hourAge < 6) recencyPoints = 2.5;
  else if (hourAge < 12) recencyPoints = 2;
  else if (hourAge < 24) recencyPoints = 1.5;
  else if (hourAge < 48) recencyPoints = 1;
  else recencyPoints = 0.5;

  // Total: 1-10 scale
  const rawScore = relevancePoints + authorityPoints + recencyPoints;
  return Math.max(1, Math.min(10, Math.round(rawScore)));
}

export function deduplicateByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const normalized = item.url.replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

// Jaccard similarity for title deduplication
export function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function deduplicateByTitle(items: NewsItem[], threshold = 0.7): NewsItem[] {
  const result: NewsItem[] = [];
  for (const item of items) {
    const isDuplicate = result.some(existing => titleSimilarity(existing.title, item.title) > threshold);
    if (!isDuplicate) {
      result.push(item);
    }
  }
  return result;
}

export function assignId(item: Omit<NewsItem, 'id'>): NewsItem {
  return { ...item, id: generateId() };
}
