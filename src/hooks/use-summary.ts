'use client';

import { useQuery } from '@tanstack/react-query';

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

export function useSummary() {
  const query = useQuery<SummaryResponse>({
    queryKey: ['summary', 'overview'],
    queryFn: async () => {
      const res = await fetch(`/api/summary?t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to fetch summary');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const forceRefresh = () => {
    return fetch(`/api/summary?force=1&t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        query.refetch();
        return data;
      });
  };

  return {
    ...query,
    isValidating: query.isFetching,
    mutate: query.refetch,
    forceRefresh,
  };
}
