'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { DailyBriefingModal } from '@/components/ui/daily-briefing-modal';

interface BriefingContextValue {
  openBriefing: () => void;
  closeBriefing: () => void;
  isOpen: boolean;
}

const BriefingContext = createContext<BriefingContextValue | null>(null);

export function BriefingProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openBriefing = useCallback(() => setIsOpen(true), []);
  const closeBriefing = useCallback(() => setIsOpen(false), []);

  // Auto-open on first visit (matches NewsDashboard behavior)
  useEffect(() => {
    try {
      const seen = sessionStorage.getItem('briefing_auto_shown');
      if (!seen) {
        const timer = setTimeout(() => {
          setIsOpen(true);
          sessionStorage.setItem('briefing_auto_shown', '1');
        }, 1500);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <BriefingContext.Provider value={{ openBriefing, closeBriefing, isOpen }}>
      {children}
      <DailyBriefingModal open={isOpen} onClose={closeBriefing} />
    </BriefingContext.Provider>
  );
}

export function useBriefing() {
  const ctx = useContext(BriefingContext);
  if (!ctx) {
    throw new Error('useBriefing must be used within BriefingProvider');
  }
  return ctx;
}
