'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { CommandPalette } from './command-palette';
import { CATEGORIES } from '@/lib/feeds/registry';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Cmd/Ctrl + K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        return;
      }

      // Sidebar collapse toggle
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
        return;
      }

      // Number keys 1-8 → navigate to category
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 8 && CATEGORIES[num - 1]) {
          e.preventDefault();
          router.push(`/${CATEGORIES[num - 1].id}`);
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          router.push('/');
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(prev => !prev)} />

      {/* Main content — offset matches sidebar width */}
      <div
        className="flex-1 flex flex-col min-h-screen transition-[margin] duration-200"
        style={{ marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }}
      >
        <TopBar onSearchClick={() => setCommandPaletteOpen(true)} />

        <main className="flex-1 p-5 overflow-y-auto overflow-x-hidden">
          {children}
        </main>

        {/* Status bar — enterprise-style bottom strip */}
        <footer
          className="flex items-center justify-between flex-shrink-0 px-4"
          style={{
            height:      'var(--statusbar-height)',
            borderTop:   '1px solid var(--border-subtle)',
            background:  'var(--bg-secondary)',
            color:       'var(--text-tertiary)',
            fontSize:    '10.5px',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              NewsDash v1.0
            </span>
            <span style={{ color: 'var(--border-strong)' }}>|</span>
            <span>35+ Sources</span>
            <span style={{ color: 'var(--border-strong)' }}>|</span>
            <span>8 Categories</span>
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span>⌘K  Search</span>
            <span style={{ color: 'var(--border-strong)' }}>|</span>
            <span>1–8  Navigate</span>
            <span style={{ color: 'var(--border-strong)' }}>|</span>
            <span>[  Sidebar</span>
          </div>
        </footer>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
