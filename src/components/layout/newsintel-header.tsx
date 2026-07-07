'use client';

import { useTheme } from '@/components/providers/theme-provider';
import { Bot, ClipboardList, Moon, Sun } from 'lucide-react';

interface NewsIntelHeaderProps {
  onSearchFocus: () => void;
  onAssistantOpen: () => void;
  onBriefingOpen: () => void;
  onMobileMenuToggle: () => void;
}

export function NewsIntelHeader({
  onSearchFocus,
  onAssistantOpen,
  onBriefingOpen,
  onMobileMenuToggle,
}: NewsIntelHeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="top-header">
      <button
        type="button"
        className="header-mobile-toggle header-btn"
        aria-label="Toggle Sidebar"
        onClick={onMobileMenuToggle}
      >
        <span>☰</span>
      </button>

      <div className="header-search">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          id="search-input"
          placeholder="Search global intelligence streams..."
          autoComplete="off"
          aria-label="Search intelligence streams"
          onFocus={onSearchFocus}
          onClick={onSearchFocus}
          readOnly
        />
        <span
          className="search-shortcut"
          onClick={onSearchFocus}
          style={{
            cursor: 'pointer',
            background: 'var(--bg-tertiary)',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: '0.7rem',
            fontWeight: 600,
            color: 'var(--accent-cyan)',
          }}
          title="Command Palette (Ctrl+K)"
        >
          Ctrl+K
        </span>
      </div>

      <div className="header-right">
        <button
          type="button"
          className="header-btn theme-toggle"
          data-tooltip="Toggle theme"
          aria-label="Toggle color theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="sun" size={18} />
          <Moon className="moon" size={18} />
        </button>

        <button
          type="button"
          className="header-btn"
          data-tooltip="AI Assistant · A"
          aria-label="Open AI Assistant"
          onClick={onAssistantOpen}
        >
          <Bot size={18} />
        </button>

        <button
          type="button"
          className="header-btn"
          data-tooltip="Daily Briefing · D"
          aria-label="Open Daily Briefing"
          onClick={onBriefingOpen}
        >
          <ClipboardList size={18} />
          <span className="notification-dot" />
        </button>
      </div>
    </header>
  );
}
