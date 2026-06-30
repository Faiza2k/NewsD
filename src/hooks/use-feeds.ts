'use client';

import { useQuery } from '@tanstack/react-query';
import type { NewsItem, CryptoAsset, GithubRepo, ResearchPaper, HackerNewsStory, Category, FeedResponse } from '@/types';

export function useFeeds(category?: Category, limit = 30) {
  return useQuery<FeedResponse>({
    queryKey: ['feeds', category, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      params.set('limit', String(limit));
      params.set('t', Date.now().toString());
      const res = await fetch(`/api/feeds?${params}`);
      if (!res.ok) throw new Error('Failed to fetch feeds');
      return res.json();
    },
  });
}

export function useCryptoMarket() {
  return useQuery<{ assets: CryptoAsset[]; lastUpdated: string }>({
    queryKey: ['crypto', 'market'],
    queryFn: async () => {
      const res = await fetch('/api/crypto/market');
      if (!res.ok) throw new Error('Failed to fetch crypto market');
      return res.json();
    },
    refetchInterval: 2 * 60 * 1000,
  });
}

export function useGithubTrending() {
  return useQuery<{ repos: GithubRepo[]; lastUpdated: string }>({
    queryKey: ['github', 'trending'],
    queryFn: async () => {
      const res = await fetch(`/api/github/trending?t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to fetch GitHub trending');
      return res.json();
    },
    refetchInterval: 15 * 60 * 1000,
  });
}

export function useResearchPapers() {
  return useQuery<{ papers: ResearchPaper[]; lastUpdated: string }>({
    queryKey: ['research', 'papers'],
    queryFn: async () => {
      const res = await fetch('/api/research/papers');
      if (!res.ok) throw new Error('Failed to fetch research papers');
      return res.json();
    },
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useHackerNews() {
  return useQuery<{ stories: HackerNewsStory[]; lastUpdated: string }>({
    queryKey: ['hackernews'],
    queryFn: async () => {
      const res = await fetch('/api/hackernews');
      if (!res.ok) throw new Error('Failed to fetch HackerNews');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });
}
