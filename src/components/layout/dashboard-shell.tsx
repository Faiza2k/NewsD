'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { NewsIntelSidebar } from './newsintel-sidebar';
import { NewsIntelHeader } from './newsintel-header';
import { NewsIntelTicker } from '@/components/ui/newsintel-ticker';
import { CommandPalette } from './command-palette';
import { AIAssistantPanel } from '@/components/ui/ai-assistant-panel';
import { BriefingProvider, useBriefing } from '@/components/providers/briefing-provider';
import { CATEGORIES } from '@/lib/feeds/registry';

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { openBriefing } = useBriefing();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (inInput) return;

      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        openBriefing();
        return;
      }

      if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setAssistantOpen(true);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 8 && CATEGORIES[num - 1]) {
          e.preventDefault();
          router.push(`/${CATEGORIES[num - 1].id}`);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, openBriefing]);

  const toggleMobileNav = () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    const next = !mobileNavOpen;
    setMobileNavOpen(next);
    sidebar?.classList.toggle('mobile-open', next);
    overlay?.classList.toggle('visible', next);
  };

  const closeMobileNav = () => {
    setMobileNavOpen(false);
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
    document.getElementById('mobile-sidebar-overlay')?.classList.remove('visible');
  };

  return (
    <div className="app-layout">
      <div
        id="mobile-sidebar-overlay"
        className="mobile-sidebar-overlay"
        onClick={closeMobileNav}
        role="presentation"
      />
      <NewsIntelSidebar />

      <main className="main-wrapper">
        <NewsIntelHeader
          onSearchFocus={() => setCommandPaletteOpen(true)}
          onAssistantOpen={() => setAssistantOpen(true)}
          onBriefingOpen={openBriefing}
          onMobileMenuToggle={toggleMobileNav}
        />
        <NewsIntelTicker />
        <section className="content-area">{children}</section>
      </main>

      <AIAssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <BriefingProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </BriefingProvider>
  );
}
