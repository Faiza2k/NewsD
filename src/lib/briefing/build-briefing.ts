import { formatDistanceToNow } from 'date-fns';
import type { NewsItem } from '@/types';

type CanonicalModule =
  | 'technology'
  | 'ai'
  | 'cybersecurity'
  | 'clouddevops'
  | 'github'
  | 'science'
  | 'startups'
  | 'crypto'
  | 'forex'
  | 'gold'
  | 'trading'
  | 'geopolitics';

export interface BriefingArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
}

export interface BriefingEvent {
  rank: number;
  title: string;
  summary: string;
  url: string;
}

export interface DailyBriefing {
  date: string;
  lastUpdated: string;
  breakingHighlights: BriefingArticle[];
  techUpdates: BriefingArticle[];
  githubUpdates: BriefingArticle[];
  researchHighlights: BriefingArticle[];
  startupUpdates: BriefingArticle[];
  marketSummary: BriefingArticle[];
  geopoliticsUpdates: BriefingArticle[];
  topEvents: BriefingEvent[];
}

const NON_EDITORIAL_SOURCES = ['Hacker News', 'CoinGecko'];
const TECH_MODULES = new Set<CanonicalModule>([
  'technology',
  'ai',
  'cybersecurity',
  'clouddevops',
  'github',
  'science',
]);
const RECENCY_MIN_GLOBAL = 3;

function isPresentDayUtc(n: NewsItem) {
  const d = new Date(n.publishedAt);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

function isWithin24Hours(n: NewsItem) {
  return Date.now() - new Date(n.publishedAt).getTime() <= 24 * 60 * 60 * 1000;
}

function isWithin7Days(n: NewsItem) {
  return Date.now() - new Date(n.publishedAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
}

function applyRecencyFilter(articles: NewsItem[], minCount = RECENCY_MIN_GLOBAL): NewsItem[] {
  if (!articles.length) return articles;
  const presentDay = articles.filter(isPresentDayUtc);
  if (presentDay.length >= minCount) return presentDay;
  const within24h = articles.filter(isWithin24Hours);
  if (within24h.length >= minCount) return within24h;
  if (within24h.length > 0) return within24h;
  const within7d = articles.filter(isWithin7Days);
  if (within7d.length > 0) return within7d;
  return articles;
}

function isEnglishText(str: string) {
  if (!str) return true;
  return !/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0590-\u05ff\u0e00-\u0e7f]/.test(str);
}

function isAcademicPaperArticle(n: NewsItem) {
  const text = `${n.title} ${n.description} ${n.source} ${n.subcategory ?? ''}`.toLowerCase();
  if (/arxiv|preprint\b|peer.?review/.test(text)) return true;
  if ((n.subcategory ?? '').toLowerCase().includes('academic')) return true;
  const researchTerms =
    /\b(machine learning|deep learning|neural network|computer vision|reinforcement learning|natural language processing|nlp|transformer|diffusion model|generative model|large language model|object detection|segmentation|multimodal|vision-language|graph neural|self-supervised)\b/;
  const paperTerms = /\b(paper|preprint|propose|proposes|framework|benchmark|dataset|architecture|algorithm|study)\b/;
  return researchTerms.test(text) && paperTerms.test(text);
}

function isTechPolicyNews(n: NewsItem) {
  const text = `${n.title} ${n.description}`.toLowerCase();
  return /\bchip\b|semiconductor|export ban|export control|ai act|ai regulation|data privacy|gdpr|chips act|supply chain|nvidia|huawei|tsmc|asml|tariff|sanction|tech trade|encryption law|cybersecurity law/.test(
    text
  );
}

function getCanonicalModule(n: NewsItem): CanonicalModule {
  if (n.category === 'github' || n.source.toLowerCase().includes('github')) return 'github';
  if (n.category === 'startups') return 'startups';
  if (n.category === 'research') return 'science';
  if (n.category === 'ai') return 'ai';
  if (n.category === 'crypto') return 'crypto';
  if (n.category === 'trading') return 'trading';
  if (n.category === 'global') return 'geopolitics';
  if (n.category === 'tech') return 'technology';

  const text = `${n.title} ${n.description} ${n.subcategory ?? ''} ${n.category}`.toLowerCase();

  if (isAcademicPaperArticle(n)) return 'science';
  if (
    text.includes('cve-') ||
    text.includes('vulnerab') ||
    text.includes('breach') ||
    text.includes('ransomware') ||
    text.includes('cybersecurity')
  ) {
    return 'cybersecurity';
  }
  if (
    text.includes('artificial intelligence') ||
    text.includes('large language model') ||
    text.includes(' openai') ||
    text.includes('anthropic') ||
    text.includes('chatgpt')
  ) {
    return 'ai';
  }
  if (
    text.includes('kubernetes') ||
    text.includes('docker') ||
    text.includes('devops') ||
    text.includes(' ci/cd')
  ) {
    return 'clouddevops';
  }
  if (
    text.includes('bitcoin') ||
    text.includes('ethereum') ||
    text.includes('crypto') ||
    text.includes('defi') ||
    text.includes('blockchain')
  ) {
    return 'crypto';
  }

  return 'technology';
}

function toBriefingArticle(n: NewsItem): BriefingArticle {
  return {
    id: n.id,
    title: n.title,
    description: n.description,
    url: n.url,
    source: n.source,
    publishedAt: n.publishedAt,
    imageUrl: n.imageUrl,
  };
}

function formatTime(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true }).replace('about ', '');
}

/** Port of NewsDashboard `buildDailyBriefing` — groups live articles into executive sections. */
export function buildDailyBriefing(articles: NewsItem[]): DailyBriefing {
  const editorial = applyRecencyFilter(
    articles.filter(
      (n) =>
        !NON_EDITORIAL_SOURCES.includes(n.source) &&
        isEnglishText(n.title) &&
        isEnglishText(n.description)
    )
  );

  const isTech = (n: NewsItem) => TECH_MODULES.has(getCanonicalModule(n));
  const isCritical = (n: NewsItem) => n.significance >= 9 || n.significance >= 8;
  const articleId = (n: NewsItem) => n.id || n.title;
  const usedIds = new Set<string>();

  const pick = (
    predicate: (n: NewsItem) => boolean,
    count: number,
    sortFn?: (a: NewsItem, b: NewsItem) => number
  ) => {
    let pool = editorial.filter((n) => !usedIds.has(articleId(n)) && predicate(n));
    if (sortFn) pool = [...pool].sort(sortFn);
    const selected = pool.slice(0, count);
    selected.forEach((n) => usedIds.add(articleId(n)));
    return selected;
  };

  const modRank: Record<string, number> = {
    ai: 5,
    technology: 4,
    github: 3,
    clouddevops: 2,
    cybersecurity: 1,
    science: 0,
  };

  const techPrioritySort = (a: NewsItem, b: NewsItem) => {
    const aR = modRank[getCanonicalModule(a)] ?? 0;
    const bR = modRank[getCanonicalModule(b)] ?? 0;
    return (
      bR - aR ||
      (b.significance || 5) - (a.significance || 5) ||
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  };

  const criticalArticles = [
    ...pick((n) => isTech(n) && isCritical(n), 3, techPrioritySort),
    ...pick(
      (n) => !isTech(n) && isCritical(n),
      2,
      (a, b) =>
        (b.significance || 5) - (a.significance || 5) ||
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    ),
  ];

  const techArticles = pick(
    (n) => ['technology', 'ai', 'clouddevops', 'cybersecurity'].includes(getCanonicalModule(n)),
    4,
    techPrioritySort
  );
  const githubArticles = pick((n) => getCanonicalModule(n) === 'github', 3, techPrioritySort);
  const researchArticles = pick(
    (n) => getCanonicalModule(n) === 'science' && isAcademicPaperArticle(n),
    4,
    (a, b) => {
      const aArxiv = /arxiv/i.test(`${a.title} ${a.source}`) ? 1 : 0;
      const bArxiv = /arxiv/i.test(`${b.title} ${b.source}`) ? 1 : 0;
      return (
        bArxiv - aArxiv ||
        (b.significance || 5) - (a.significance || 5) ||
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    }
  );
  const startupArticles = pick((n) => getCanonicalModule(n) === 'startups', 3);
  const marketArticles = pick(
    (n) => ['trading', 'gold', 'forex', 'crypto'].includes(getCanonicalModule(n)),
    3
  );
  const geopoliticsArticles = pick(
    (n) => getCanonicalModule(n) === 'geopolitics' && isTechPolicyNews(n),
    2
  );

  const timelineItems = editorial
    .filter((n) => !usedIds.has(articleId(n)))
    .sort((a, b) => {
      const aTech = isTech(a) ? 1 : 0;
      const bTech = isTech(b) ? 1 : 0;
      return (
        bTech - aTech ||
        (b.significance || 5) - (a.significance || 5) ||
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    })
    .slice(0, 8);

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return {
    date: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    lastUpdated: timeStr,
    breakingHighlights: criticalArticles.map(toBriefingArticle),
    techUpdates: techArticles.map(toBriefingArticle),
    githubUpdates: githubArticles.map(toBriefingArticle),
    researchHighlights: researchArticles.map(toBriefingArticle),
    startupUpdates: startupArticles.map(toBriefingArticle),
    marketSummary: marketArticles.map(toBriefingArticle),
    geopoliticsUpdates: geopoliticsArticles.map(toBriefingArticle),
    topEvents: timelineItems.map((n, i) => ({
      rank: i + 1,
      title: n.title,
      summary: n.description,
      url: n.url,
    })),
  };
}

export { formatTime as formatBriefingTime };
