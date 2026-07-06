'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/components/providers/theme-provider';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

interface TopBarProps {
  onSearchClick: () => void;
  onAssistantClick: () => void;
  onBriefingClick: () => void;
}

export function TopBar({ onSearchClick, onAssistantClick, onBriefingClick }: TopBarProps) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => { setMounted(true); }, []);

  return (
    <header className="ni-top-header">
      <button
        type="button"
        onClick={onSearchClick}
        className="ni-header-search"
        id="topbar-search"
      >
        <Search style={{ width: 15, height: 15, color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'left' }}>
          Search global intelligence streams…
        </span>
        <kbd
          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-default)',
          }}
        >
          Ctrl+K
        </kbd>
      </button>

      <div className="flex items-center gap-1 ml-auto">
        {mounted && (
          <button
            type="button"
            className="ni-header-btn"
            title="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>
        )}

        <button
          type="button"
          className="ni-header-btn"
          title="Open AI Assistant"
          onClick={onAssistantClick}
        >
          <span>🤖</span>
        </button>

        <button
          type="button"
          className="ni-header-btn"
          title="Daily Briefing"
          onClick={onBriefingClick}
        >
          <span>📋</span>
          <span className="ni-notification-dot" />
        </button>
      </div>
    </header>
  );
}
