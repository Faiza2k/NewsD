'use client';

import { useTheme } from '@/components/providers/theme-provider';

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
          title="Toggle color theme (Light / Dark)"
          aria-label="Toggle color theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span className="sun">☀️</span>
          <span className="moon">🌙</span>
        </button>

        <button
          type="button"
          className="header-btn"
          title="Open AI Assistant Panel (Shortcut: A)"
          aria-label="Open AI Assistant"
          onClick={onAssistantOpen}
        >
          <span>🤖</span>
        </button>

        <button
          type="button"
          className="header-btn"
          title="Open Daily Briefing Report (Shortcut: D)"
          aria-label="Open Daily Briefing"
          onClick={onBriefingOpen}
        >
          <span>📋</span>
          <span className="notification-dot" />
        </button>
      </div>
    </header>
  );
}
