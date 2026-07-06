import type { CategoryInfo, FeedSource, Category } from '@/types';
import { NEWSDASHBOARD_FEEDS } from './newsdashboard-feeds';

function mergeFeedSources(...lists: FeedSource[][]): FeedSource[] {
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  const merged: FeedSource[] = [];
  for (const list of lists) {
    for (const feed of list) {
      const urlKey = feed.url.replace(/\/$/, '').toLowerCase();
      if (seenUrls.has(urlKey) || seenIds.has(feed.id)) continue;
      seenUrls.add(urlKey);
      seenIds.add(feed.id);
      merged.push(feed);
    }
  }
  return merged;
}

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

const BASE_FEED_SOURCES: FeedSource[] = [
  // ─── AI (18 sources) ───
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
  { id: 'wired-ai', name: 'Wired AI', url: 'https://www.wired.com/feed/tag/ai/latest/rss', category: 'ai', subcategories: ['analysis', 'culture'], priority: 4 },
  { id: 'zdnet-ai', name: 'ZDNet AI', url: 'https://www.zdnet.com/topic/artificial-intelligence/rss.xml', category: 'ai', subcategories: ['enterprise', 'tools'], priority: 3 },
  { id: 'techcrunch-ai', name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'ai', subcategories: ['startups', 'funding'], priority: 4 },
  { id: 'the-information-ai', name: 'The Information AI', url: 'https://www.theinformation.com/rss', category: 'ai', subcategories: ['industry', 'analysis'], priority: 5 },
  { id: 'synced-review', name: 'Synced Review', url: 'https://syncedreview.com/feed/', category: 'ai', subcategories: ['research', 'china'], priority: 3 },
  { id: 'machine-learning-mastery', name: 'Machine Learning Mastery', url: 'https://machinelearningmastery.com/feed/', category: 'ai', subcategories: ['tutorials', 'models'], priority: 3 },
  { id: 'towards-data-science', name: 'Towards Data Science', url: 'https://towardsdatascience.com/feed', category: 'ai', subcategories: ['data', 'ml'], priority: 3 },
  { id: 'ai-news-blog', name: 'AI News', url: 'https://www.artificialintelligence-news.com/feed/', category: 'ai', subcategories: ['news', 'industry'], priority: 3 },

  // ─── Crypto (14 sources) ───
  { id: 'coindesk', name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto', subcategories: ['market', 'regulation'], priority: 5 },
  { id: 'cointelegraph', name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto', subcategories: ['market', 'defi'], priority: 5 },
  { id: 'the-block', name: 'The Block', url: 'https://www.theblock.co/rss.xml', category: 'crypto', subcategories: ['analysis', 'market'], priority: 4 },
  { id: 'decrypt', name: 'Decrypt', url: 'https://decrypt.co/feed', category: 'crypto', subcategories: ['market', 'defi'], priority: 4 },
  { id: 'cryptoslate', name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/', category: 'crypto', subcategories: ['market', 'analysis'], priority: 3 },
  { id: 'bitcoin-magazine', name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed', category: 'crypto', subcategories: ['bitcoin'], priority: 3 },
  { id: 'coinbureau', name: 'Coin Bureau', url: 'https://www.coinbureau.com/feed/', category: 'crypto', subcategories: ['analysis', 'education'], priority: 3 },
  { id: 'cryptonews', name: 'CryptoNews', url: 'https://cryptonews.com/news/feed/', category: 'crypto', subcategories: ['news', 'market'], priority: 3 },
  { id: 'bitcoinist', name: 'Bitcoinist', url: 'https://bitcoinist.com/feed/', category: 'crypto', subcategories: ['bitcoin', 'market'], priority: 3 },
  { id: 'u-today', name: 'U.Today', url: 'https://u.today/rss', category: 'crypto', subcategories: ['market', 'altcoins'], priority: 3 },
  { id: 'ambcrypto', name: 'AMBCrypto', url: 'https://ambcrypto.com/feed/', category: 'crypto', subcategories: ['analysis', 'market'], priority: 3 },
  { id: 'cryptopotato', name: 'CryptoPotato', url: 'https://cryptopotato.com/feed/', category: 'crypto', subcategories: ['market', 'defi'], priority: 3 },
  { id: 'dailyhodl', name: 'The Daily Hodl', url: 'https://thedailyhodl.com/feed/', category: 'crypto', subcategories: ['market', 'regulation'], priority: 3 },
  { id: 'coinjournal', name: 'CoinJournal', url: 'https://coinjournal.net/news/feed/', category: 'crypto', subcategories: ['news', 'analysis'], priority: 3 },

  // ─── Trading & Markets (12 sources) ───
  { id: 'reuters-business', name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance', category: 'trading', subcategories: ['forex', 'stocks'], priority: 5 },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', category: 'trading', subcategories: ['stocks', 'analysis'], priority: 4 },
  { id: 'investing-com', name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss', category: 'trading', subcategories: ['signals', 'forex'], priority: 4 },
  { id: 'forexlive', name: 'ForexLive', url: 'https://www.forexlive.com/feed/news', category: 'trading', subcategories: ['forex', 'economic'], priority: 3 },
  { id: 'bloomberg-markets', name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', category: 'trading', subcategories: ['stocks', 'bonds'], priority: 5 },
  { id: 'cnbc-finance', name: 'CNBC Finance', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', category: 'trading', subcategories: ['markets', 'economy'], priority: 5 },
  { id: 'ft-markets', name: 'Financial Times Markets', url: 'https://www.ft.com/markets?format=rss', category: 'trading', subcategories: ['markets', 'analysis'], priority: 5 },
  { id: 'wsj-markets', name: 'WSJ Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', category: 'trading', subcategories: ['stocks', 'bonds'], priority: 5 },
  { id: 'yahoo-finance', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', category: 'trading', subcategories: ['stocks', 'news'], priority: 4 },
  { id: 'seeking-alpha', name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', category: 'trading', subcategories: ['analysis', 'stocks'], priority: 4 },
  { id: 'zerohedge', name: 'ZeroHedge', url: 'https://www.zerohedge.com/rss.xml', category: 'trading', subcategories: ['analysis', 'macro'], priority: 3 },
  { id: 'economist-finance', name: 'The Economist Finance', url: 'https://www.economist.com/finance-and-economics/rss.xml', category: 'trading', subcategories: ['economy', 'analysis'], priority: 4 },

  // ─── Tech & Innovation (14 sources) ───
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech', subcategories: ['products', 'startups'], priority: 5 },
  { id: 'the-verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech', subcategories: ['products', 'hardware'], priority: 5 },
  { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'tech', subcategories: ['innovation'], priority: 4 },
  { id: 'ars-technica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech', subcategories: ['hardware', 'science'], priority: 4 },
  { id: 'engadget', name: 'Engadget', url: 'https://www.engadget.com/rss.xml', category: 'tech', subcategories: ['products', 'hardware'], priority: 3 },
  { id: 'the-information', name: 'The Information', url: 'https://www.theinformation.com/rss', category: 'tech', subcategories: ['industry', 'analysis'], priority: 5 },
  { id: 'recode', name: 'Recode', url: 'https://www.vox.com/recode/index.xml', category: 'tech', subcategories: ['industry', 'policy'], priority: 4 },
  { id: 'fast-company', name: 'Fast Company', url: 'https://www.fastcompany.com/rss', category: 'tech', subcategories: ['innovation', 'design'], priority: 4 },
  { id: 'mit-tech-review', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', category: 'tech', subcategories: ['research', 'innovation'], priority: 5 },
  { id: 'zdnet', name: 'ZDNet', url: 'https://www.zdnet.com/news/rss.xml', category: 'tech', subcategories: ['enterprise', 'cloud'], priority: 3 },
  { id: 'cnet', name: 'CNET', url: 'https://www.cnet.com/rss/news/', category: 'tech', subcategories: ['products', 'reviews'], priority: 3 },
  { id: 'gizmodo', name: 'Gizmodo', url: 'https://gizmodo.com/rss', category: 'tech', subcategories: ['gadgets', 'science'], priority: 3 },
  { id: 'techradar', name: 'TechRadar', url: 'https://www.techradar.com/rss', category: 'tech', subcategories: ['hardware', 'reviews'], priority: 3 },
  { id: 'anandtech', name: 'AnandTech', url: 'https://www.anandtech.com/rss', category: 'tech', subcategories: ['hardware', 'chips'], priority: 4 },

  // ─── GitHub & Open Source (8 sources) ───
  { id: 'github-blog', name: 'GitHub Blog', url: 'https://github.blog/feed/', category: 'github', subcategories: ['platform', 'features'], priority: 5 },
  { id: 'dev-to', name: 'DEV Community', url: 'https://dev.to/feed', category: 'github', subcategories: ['community', 'tutorials'], priority: 4 },
  { id: 'hacker-news', name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'github', subcategories: ['news', 'startups'], priority: 5 },
  { id: 'lobsters', name: 'Lobsters', url: 'https://lobste.rs/rss', category: 'github', subcategories: ['community', 'tech'], priority: 4 },
  { id: 'opensource-com', name: 'Opensource.com', url: 'https://opensource.com/feed', category: 'github', subcategories: ['opensource', 'linux'], priority: 3 },
  { id: 'infoq', name: 'InfoQ', url: 'https://www.infoq.com/feed/', category: 'github', subcategories: ['enterprise', 'architecture'], priority: 4 },
  { id: 'docker-blog', name: 'Docker Blog', url: 'https://www.docker.com/blog/feed/', category: 'github', subcategories: ['containers', 'devops'], priority: 3 },
  { id: 'kubernetes-blog', name: 'Kubernetes Blog', url: 'https://kubernetes.io/feed.xml', category: 'github', subcategories: ['k8s', 'cloud-native'], priority: 4 },

  // ─── Research (10 sources) ───
  { id: 'arxiv-ai', name: 'arXiv AI', url: 'https://rss.arxiv.org/rss/cs.AI', category: 'research', subcategories: ['papers'], priority: 5 },
  { id: 'arxiv-ml', name: 'arXiv ML', url: 'https://rss.arxiv.org/rss/cs.LG', category: 'research', subcategories: ['papers'], priority: 5 },
  { id: 'arxiv-nlp', name: 'arXiv NLP', url: 'https://rss.arxiv.org/rss/cs.CL', category: 'research', subcategories: ['papers'], priority: 4 },
  { id: 'arxiv-cv', name: 'arXiv CV', url: 'https://rss.arxiv.org/rss/cs.CV', category: 'research', subcategories: ['papers'], priority: 4 },
  { id: 'arxiv-robotics', name: 'arXiv Robotics', url: 'https://rss.arxiv.org/rss/cs.RO', category: 'research', subcategories: ['papers', 'robotics'], priority: 4 },
  { id: 'arxiv-ir', name: 'arXiv Information Retrieval', url: 'https://rss.arxiv.org/rss/cs.IR', category: 'research', subcategories: ['papers', 'search'], priority: 3 },
  { id: 'arxiv-neuro', name: 'arXiv Neuroscience', url: 'https://rss.arxiv.org/rss/q-bio.NC', category: 'research', subcategories: ['papers', 'neuro'], priority: 3 },
  { id: 'arxiv-quantum', name: 'arXiv Quantum Computing', url: 'https://rss.arxiv.org/rss/quant-ph', category: 'research', subcategories: ['papers', 'quantum'], priority: 4 },
  { id: 'nature-machine-intelligence', name: 'Nature Machine Intelligence', url: 'https://www.nature.com/natmachintell.rss', category: 'research', subcategories: ['papers', 'ai'], priority: 5 },
  { id: 'science-robotics', name: 'Science Robotics', url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=robotics', category: 'research', subcategories: ['papers', 'robotics'], priority: 4 },

  // ─── Startups & Funding (10 sources) ───
  { id: 'techcrunch-startups', name: 'TechCrunch Startups', url: 'https://techcrunch.com/category/startups/feed/', category: 'startups', subcategories: ['funding', 'launches'], priority: 5 },
  { id: 'ycombinator-blog', name: 'Y Combinator Blog', url: 'https://www.ycombinator.com/blog/rss/', category: 'startups', subcategories: ['yc'], priority: 4 },
  { id: 'crunchbase-news', name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/', category: 'startups', subcategories: ['funding', 'analysis'], priority: 4 },
  { id: 'venturebeat-ventures', name: 'VentureBeat Ventures', url: 'https://venturebeat.com/category/ventures/feed/', category: 'startups', subcategories: ['funding', 'vc'], priority: 4 },
  { id: 'strictlyvc', name: 'StrictlyVC', url: 'https://strictlyvc.com/feed/', category: 'startups', subcategories: ['funding', 'news'], priority: 4 },
  { id: 'eu-startups', name: 'EU-Startups', url: 'https://www.eu-startups.com/feed/', category: 'startups', subcategories: ['europe', 'funding'], priority: 3 },
  { id: 'tech-eu', name: 'Tech.eu', url: 'https://tech.eu/feed/', category: 'startups', subcategories: ['europe', 'funding'], priority: 3 },
  { id: 'dealstreetasia', name: 'DealStreetAsia', url: 'https://www.dealstreetasia.com/feed', category: 'startups', subcategories: ['asia', 'funding'], priority: 3 },
  { id: 'entrackr', name: 'Entrackr', url: 'https://entrackr.com/feed/', category: 'startups', subcategories: ['india', 'funding'], priority: 3 },
  { id: 'forbes-startups', name: 'Forbes Startups', url: 'https://www.forbes.com/startups/feed/', category: 'startups', subcategories: ['funding', 'analysis'], priority: 4 },

  // ─── Global Events (12 sources) ───
  { id: 'reuters-world', name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?best-topics=political-general', category: 'global', subcategories: ['geopolitics'], priority: 5 },
  { id: 'bbc-tech', name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'global', subcategories: ['technology'], priority: 4 },
  { id: 'ap-tech', name: 'AP Technology', url: 'https://rsshub.app/apnews/topics/technology', category: 'global', subcategories: ['technology'], priority: 3 },
  { id: 'bbc-world', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'global', subcategories: ['world', 'geopolitics'], priority: 5 },
  { id: 'al-jazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'global', subcategories: ['world', 'middle-east'], priority: 4 },
  { id: 'guardian-world', name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'global', subcategories: ['world', 'politics'], priority: 4 },
  { id: 'guardian-tech', name: 'The Guardian Tech', url: 'https://www.theguardian.com/technology/rss', category: 'global', subcategories: ['technology', 'policy'], priority: 4 },
  { id: 'nyt-world', name: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'global', subcategories: ['world', 'politics'], priority: 5 },
  { id: 'nyt-tech', name: 'NYT Technology', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', category: 'global', subcategories: ['technology', 'business'], priority: 4 },
  { id: 'scmp-tech', name: 'South China Morning Post Tech', url: 'https://www.scmp.com/rss/91/feed', category: 'global', subcategories: ['china', 'technology'], priority: 4 },
  { id: 'nikkei-asia', name: 'Nikkei Asia', url: 'https://asia.nikkei.com/.rss/feed', category: 'global', subcategories: ['asia', 'business'], priority: 4 },
  { id: 'politico', name: 'Politico', url: 'https://rss.politico.com/politics-news.xml', category: 'global', subcategories: ['politics', 'policy'], priority: 4 },

  // ─── Reddit (community sources by category) ───
  { id: 'reddit-artificial', name: 'Reddit r/artificial', url: 'https://www.reddit.com/r/artificial/.rss', category: 'ai', subcategories: ['news', 'discussion'], priority: 3 },
  { id: 'reddit-machinelearning', name: 'Reddit r/MachineLearning', url: 'https://www.reddit.com/r/MachineLearning/.rss', category: 'ai', subcategories: ['research', 'models'], priority: 3 },
  { id: 'reddit-localllama', name: 'Reddit r/LocalLLaMA', url: 'https://www.reddit.com/r/LocalLLaMA/.rss', category: 'ai', subcategories: ['models', 'tools'], priority: 3 },
  { id: 'reddit-openai', name: 'Reddit r/OpenAI', url: 'https://www.reddit.com/r/OpenAI/.rss', category: 'ai', subcategories: ['models', 'news'], priority: 3 },

  { id: 'reddit-cryptocurrency', name: 'Reddit r/CryptoCurrency', url: 'https://www.reddit.com/r/CryptoCurrency/.rss', category: 'crypto', subcategories: ['market', 'news'], priority: 3 },
  { id: 'reddit-bitcoin', name: 'Reddit r/Bitcoin', url: 'https://www.reddit.com/r/Bitcoin/.rss', category: 'crypto', subcategories: ['bitcoin', 'market'], priority: 3 },
  { id: 'reddit-ethereum', name: 'Reddit r/ethereum', url: 'https://www.reddit.com/r/ethereum/.rss', category: 'crypto', subcategories: ['ethereum', 'defi'], priority: 3 },
  { id: 'reddit-defi', name: 'Reddit r/defi', url: 'https://www.reddit.com/r/defi/.rss', category: 'crypto', subcategories: ['defi', 'analysis'], priority: 3 },

  { id: 'reddit-stocks', name: 'Reddit r/stocks', url: 'https://www.reddit.com/r/stocks/.rss', category: 'trading', subcategories: ['stocks', 'analysis'], priority: 3 },
  { id: 'reddit-investing', name: 'Reddit r/investing', url: 'https://www.reddit.com/r/investing/.rss', category: 'trading', subcategories: ['stocks', 'markets'], priority: 3 },
  { id: 'reddit-stockmarket', name: 'Reddit r/StockMarket', url: 'https://www.reddit.com/r/StockMarket/.rss', category: 'trading', subcategories: ['markets', 'news'], priority: 3 },
  { id: 'reddit-forex', name: 'Reddit r/Forex', url: 'https://www.reddit.com/r/Forex/.rss', category: 'trading', subcategories: ['forex', 'signals'], priority: 3 },

  { id: 'reddit-programming', name: 'Reddit r/programming', url: 'https://www.reddit.com/r/programming/.rss', category: 'github', subcategories: ['community', 'news'], priority: 3 },
  { id: 'reddit-opensource', name: 'Reddit r/opensource', url: 'https://www.reddit.com/r/opensource/.rss', category: 'github', subcategories: ['opensource', 'tools'], priority: 3 },
  { id: 'reddit-devops', name: 'Reddit r/devops', url: 'https://www.reddit.com/r/devops/.rss', category: 'github', subcategories: ['devops', 'cloud'], priority: 3 },
  { id: 'reddit-selfhosted', name: 'Reddit r/selfhosted', url: 'https://www.reddit.com/r/selfhosted/.rss', category: 'github', subcategories: ['tools', 'community'], priority: 3 },

  { id: 'reddit-technology', name: 'Reddit r/technology', url: 'https://www.reddit.com/r/technology/.rss', category: 'tech', subcategories: ['news', 'products'], priority: 3 },
  { id: 'reddit-gadgets', name: 'Reddit r/gadgets', url: 'https://www.reddit.com/r/gadgets/.rss', category: 'tech', subcategories: ['hardware', 'products'], priority: 3 },
  { id: 'reddit-futurology', name: 'Reddit r/Futurology', url: 'https://www.reddit.com/r/Futurology/.rss', category: 'tech', subcategories: ['innovation', 'science'], priority: 3 },

  { id: 'reddit-compsci', name: 'Reddit r/compsci', url: 'https://www.reddit.com/r/compsci/.rss', category: 'research', subcategories: ['papers', 'academia'], priority: 3 },
  { id: 'reddit-science', name: 'Reddit r/science', url: 'https://www.reddit.com/r/science/.rss', category: 'research', subcategories: ['research', 'papers'], priority: 3 },

  { id: 'reddit-startups', name: 'Reddit r/startups', url: 'https://www.reddit.com/r/startups/.rss', category: 'startups', subcategories: ['funding', 'launches'], priority: 3 },
  { id: 'reddit-entrepreneur', name: 'Reddit r/Entrepreneur', url: 'https://www.reddit.com/r/Entrepreneur/.rss', category: 'startups', subcategories: ['founders', 'growth'], priority: 3 },
  { id: 'reddit-saas', name: 'Reddit r/SaaS', url: 'https://www.reddit.com/r/SaaS/.rss', category: 'startups', subcategories: ['saas', 'products'], priority: 3 },

  { id: 'reddit-worldnews', name: 'Reddit r/worldnews', url: 'https://www.reddit.com/r/worldnews/.rss', category: 'global', subcategories: ['world', 'geopolitics'], priority: 3 },
  { id: 'reddit-geopolitics', name: 'Reddit r/geopolitics', url: 'https://www.reddit.com/r/geopolitics/.rss', category: 'global', subcategories: ['geopolitics', 'policy'], priority: 3 },
  { id: 'reddit-news', name: 'Reddit r/news', url: 'https://www.reddit.com/r/news/.rss', category: 'global', subcategories: ['world', 'news'], priority: 3 },
];

/** All RSS sources: base registry + NewsDashboard app.py feeds (URL-deduped). */
export const FEED_SOURCES: FeedSource[] = mergeFeedSources(BASE_FEED_SOURCES, NEWSDASHBOARD_FEEDS);

export const FEED_SOURCE_COUNT = FEED_SOURCES.length;

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
