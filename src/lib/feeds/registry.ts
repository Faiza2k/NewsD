import type { CategoryInfo, FeedSource, Category } from '@/types';

export const CATEGORIES: CategoryInfo[] = [
  {
    id: 'ai',
    name: 'Artificial Intelligence',
    icon: '🤖',
    description: 'AI models, research, tools & industry updates',
    color: 'var(--accent-purple)',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
  },
  {
    id: 'crypto',
    name: 'Cryptocurrency',
    icon: '₿',
    description: 'Market news, ETFs, DeFi & on-chain analysis',
    color: 'var(--accent-amber)',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
  },
  {
    id: 'trading',
    name: 'Trading & Markets',
    icon: '📈',
    description: 'Forex, stocks, commodities & economic events',
    color: 'var(--accent-emerald)',
    gradient: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
  },
  {
    id: 'github',
    name: 'GitHub Innovation',
    icon: '💻',
    description: 'Trending repos, AI tools & open-source projects',
    color: 'var(--text-primary)',
    gradient: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
  },
  {
    id: 'tech',
    name: 'Technology',
    icon: '🚀',
    description: 'Product launches, hardware, cloud & innovation',
    color: 'var(--accent-blue)',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
  },
  {
    id: 'research',
    name: 'Research',
    icon: '📚',
    description: 'Papers from arXiv, Google, DeepMind & more',
    color: 'var(--accent-indigo)',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  },
  {
    id: 'startups',
    name: 'Startups & Funding',
    icon: '💼',
    description: 'Funding rounds, YC companies & unicorns',
    color: 'var(--accent-cyan)',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  },
  {
    id: 'global',
    name: 'Global Events',
    icon: '🌍',
    description: 'World events impacting tech, crypto & markets',
    color: 'var(--accent-rose)',
    gradient: 'linear-gradient(135deg, #f43f5e 0%, #f97316 100%)',
  },
];

export const FEED_SOURCES: FeedSource[] = [
  // ─── AI ───
  { id: 'openai-blog', name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', category: 'ai', subcategories: ['models', 'research'], priority: 5 },
  { id: 'anthropic-blog', name: 'Anthropic Blog', url: 'https://www.anthropic.com/rss.xml', category: 'ai', subcategories: ['models', 'safety'], priority: 5 },
  { id: 'google-ai-blog', name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', category: 'ai', subcategories: ['research', 'models'], priority: 5 },
  { id: 'deepmind-blog', name: 'DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml', category: 'ai', subcategories: ['research'], priority: 5 },
  { id: 'nvidia-blog', name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/', category: 'ai', subcategories: ['hardware', 'tools'], priority: 4 },
  { id: 'hf-blog', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', category: 'ai', subcategories: ['models', 'tools'], priority: 4 },
  { id: 'mit-tech-review-ai', name: 'MIT Tech Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', category: 'ai', subcategories: ['analysis'], priority: 4 },
  { id: 'venturebeat-ai', name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'ai', subcategories: ['industry', 'funding'], priority: 3 },
  { id: 'the-verge-ai', name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'ai', subcategories: ['tools', 'products'], priority: 3 },
  { id: 'ars-technica-ai', name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', category: 'ai', subcategories: ['analysis'], priority: 3 },

  // ─── Crypto ───
  { id: 'coindesk', name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto', subcategories: ['market', 'regulation'], priority: 5 },
  { id: 'cointelegraph', name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto', subcategories: ['market', 'defi'], priority: 5 },
  { id: 'the-block', name: 'The Block', url: 'https://www.theblock.co/rss.xml', category: 'crypto', subcategories: ['analysis', 'market'], priority: 4 },
  { id: 'decrypt', name: 'Decrypt', url: 'https://decrypt.co/feed', category: 'crypto', subcategories: ['market', 'defi'], priority: 4 },
  { id: 'cryptoslate', name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/', category: 'crypto', subcategories: ['market', 'analysis'], priority: 3 },
  { id: 'bitcoin-magazine', name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed', category: 'crypto', subcategories: ['bitcoin'], priority: 3 },

  // ─── Trading & Markets ───
  { id: 'reuters-business', name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance', category: 'trading', subcategories: ['forex', 'stocks'], priority: 5 },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', category: 'trading', subcategories: ['stocks', 'analysis'], priority: 4 },
  { id: 'investing-com', name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss', category: 'trading', subcategories: ['signals', 'forex'], priority: 4 },
  { id: 'forexlive', name: 'ForexLive', url: 'https://www.forexlive.com/feed/news', category: 'trading', subcategories: ['forex', 'economic'], priority: 3 },

  // ─── Tech & Innovation ───
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech', subcategories: ['products', 'startups'], priority: 5 },
  { id: 'the-verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech', subcategories: ['products', 'hardware'], priority: 5 },
  { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'tech', subcategories: ['innovation'], priority: 4 },
  { id: 'ars-technica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech', subcategories: ['hardware', 'science'], priority: 4 },
  { id: 'engadget', name: 'Engadget', url: 'https://www.engadget.com/rss.xml', category: 'tech', subcategories: ['products', 'hardware'], priority: 3 },

  // ─── Research ───
  { id: 'arxiv-ai', name: 'arXiv AI', url: 'https://rss.arxiv.org/rss/cs.AI', category: 'research', subcategories: ['papers'], priority: 5 },
  { id: 'arxiv-ml', name: 'arXiv ML', url: 'https://rss.arxiv.org/rss/cs.LG', category: 'research', subcategories: ['papers'], priority: 5 },
  { id: 'arxiv-nlp', name: 'arXiv NLP', url: 'https://rss.arxiv.org/rss/cs.CL', category: 'research', subcategories: ['papers'], priority: 4 },
  { id: 'arxiv-cv', name: 'arXiv CV', url: 'https://rss.arxiv.org/rss/cs.CV', category: 'research', subcategories: ['papers'], priority: 4 },

  // ─── Startups & Funding ───
  { id: 'techcrunch-startups', name: 'TechCrunch Startups', url: 'https://techcrunch.com/category/startups/feed/', category: 'startups', subcategories: ['funding', 'launches'], priority: 5 },
  { id: 'ycombinator-blog', name: 'Y Combinator Blog', url: 'https://www.ycombinator.com/blog/rss/', category: 'startups', subcategories: ['yc'], priority: 4 },
  { id: 'crunchbase-news', name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/', category: 'startups', subcategories: ['funding', 'analysis'], priority: 4 },

  // ─── Global Events ───
  { id: 'reuters-world', name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?best-topics=political-general', category: 'global', subcategories: ['geopolitics'], priority: 5 },
  { id: 'bbc-tech', name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'global', subcategories: ['technology'], priority: 4 },
  { id: 'ap-tech', name: 'AP Technology', url: 'https://rsshub.app/apnews/topics/technology', category: 'global', subcategories: ['technology'], priority: 3 },
];

export function getFeedsByCategory(category: Category): FeedSource[] {
  return FEED_SOURCES
    .filter(feed => feed.category === category)
    .sort((a, b) => b.priority - a.priority);
}

export function getCategoryInfo(category: Category): CategoryInfo | undefined {
  return CATEGORIES.find(c => c.id === category);
}

// Language color map for GitHub repos
export const LANGUAGE_COLORS: Record<string, string> = {
  Python: '#3572A5',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Ruby: '#701516',
  Jupyter: '#DA5B0B',
  Shell: '#89e051',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  Julia: '#a270ba',
};
