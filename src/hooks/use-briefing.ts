'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailyBriefing } from '@/lib/briefing/build-briefing';

export function useBriefingData(enabled: boolean) {
  return useQuery<DailyBriefing>({
    queryKey: ['briefing'],
    queryFn: async () => {
      const res = await fetch(`/api/briefing?t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to load briefing');
      return res.json();
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

export function useRefreshBriefing() {
  const queryClient = useQueryClient();

  return async () => {
    const res = await fetch(`/api/briefing?force=1&t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to refresh briefing');
    const data = await res.json();
    queryClient.setQueryData(['briefing'], data);
    return data as DailyBriefing;
  };
}
