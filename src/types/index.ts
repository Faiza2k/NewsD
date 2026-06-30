// ─── Core Types for AI & Crypto Intelligence Dashboard ───

export type Category =
  | 'ai'
  | 'crypto'
  | 'trading'
  | 'github'
  | 'tech'
  | 'research'
  | 'startups'
  | 'global';

export type SignificanceLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  sourceIcon?: string;
  category: Category;
  subcategory?: string;
  publishedAt: string;
  imageUrl?: string;
  significance: number; // 1-10
  tags: string[];
}

export interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  sparkline_in_7d?: {
    price: number[];
  };
  market_cap_rank: number;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  language: string;
  stargazers_count: number;
  forks_count: number;
  stars_today?: number;
  owner: {
    login: string;
    avatar_url: string;
  };
  topics: string[];
  created_at: string;
  updated_at: string;
}

export interface ResearchPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedAt: string;
  updatedAt?: string;
  categories: string[];
  pdfUrl: string;
  arxivUrl: string;
  githubUrl?: string;
}

export interface StartupFunding {
  id: string;
  company: string;
  round: string;
  amount: string;
  investors: string[];
  industry: string;
  country: string;
  date: string;
  description: string;
  url: string;
}

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  category: Category;
  subcategories: string[];
  icon?: string;
  priority: number; // 1-5
}

export interface CategoryInfo {
  id: Category;
  name: string;
  icon: string;
  description: string;
  color: string;
  gradient: string;
}

export interface FeedResponse {
  items: NewsItem[];
  total: number;
  lastUpdated: string;
  category?: Category;
}

export interface HackerNewsStory {
  id: number;
  title: string;
  url: string;
  score: number;
  by: string;
  time: number;
  descendants: number;
  type: string;
}
