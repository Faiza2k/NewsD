'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Search, Bell, RefreshCw, Moon, Sun, ChevronRight, LayoutDashboard } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { cn } from '@/lib/utils';
import { CATEGORIES } from '@/lib/feeds/registry';

interface TopBarProps {
  onSearchClick: () => void;
}

function Breadcrumb() {
  const pathname = usePathname();
  const cat = pathname.split('/').filter(Boolean)[0]
    ? CATEGORIES.find(c => c.id === pathname.split('/').filter(Boolean)[0])
    : null;

  return (
    <nav className="flex items-center gap-1.5 text-[12.5px]">
      <LayoutDashboard style={{ width: 13, height: 13, color: 'var(--text-muted)' }} />
      <span style={{ color: 'var(--text-muted)' }}>NewsDash</span>
      <ChevronRight style={{ width: 11, height: 11, color: 'var(--text-muted)', opacity: 0.5 }} />
      <span
        className="font-semibold"
        style={{ color: cat ? 'var(--text-secondary)' : 'var(--text-primary)' }}
      >
        {cat ? cat.name : 'Overview'}
      </span>
    </nav>
  );
}

export function TopBar({ onSearchClick }: TopBarProps) {
  const [time, setTime] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        })
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

  return (
    <header
      className="flex items-center justify-between flex-shrink-0 px-5 sticky top-0 z-30"
      style={{
        height:       'var(--topbar-height)',
        background:   'rgba(17, 21, 28, 0.92)',
        backdropFilter: 'blur(24px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
        borderBottom: '1px solid var(--border-default)',
        boxShadow:    '0 1px 0 rgba(255,255,255,0.03), 0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Left — breadcrumb */}
      <Breadcrumb />

      {/* Center — search */}
      <button
        onClick={onSearchClick}
        id="topbar-search"
        className="flex items-center gap-2.5 rounded-[9px] transition-all group"
        style={{
          background:   'rgba(255,255,255,0.04)',
          border:       '1px solid var(--border-default)',
          padding:      '6px 14px',
          minWidth:     '260px',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)';
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
        }}
      >
        <Search style={{ width: 13, height: 13, color: 'var(--text-muted)', flexShrink: 0 }} />
        <span
          className="text-[12.5px] flex-1 text-left"
          style={{ color: 'var(--text-muted)' }}
        >
          Search intelligence…
        </span>
        <kbd
          className="text-[10px] font-mono px-1.5 py-0.5 rounded ml-4"
          style={{
            background: 'rgba(255,255,255,0.06)',
            color:      'var(--text-muted)',
            border:     '1px solid var(--border-default)',
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Right — actions */}
      <div className="flex items-center gap-1.5">

        {/* LIVE pill */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            background: 'rgba(16,185,129,0.10)',
            border:     '1px solid rgba(16,185,129,0.22)',
            boxShadow:  '0 0 10px rgba(16,185,129,0.12)',
          }}
        >
          <div className="live-dot" />
          <span
            className="text-[10px] font-bold tracking-widest"
            style={{ color: '#10B981', letterSpacing: '0.10em' }}
          >
            LIVE
          </span>
        </div>

        {/* Clock */}
        <div
          className="px-2.5 py-1 rounded-[6px]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border:     '1px solid var(--border-subtle)',
          }}
        >
          <span
            className="stat-number text-[11.5px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {time}
          </span>
        </div>

        {/* Separator */}
        <div
          className="w-px h-5 mx-0.5"
          style={{ background: 'var(--border-default)' }}
        />

        {/* Theme Toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            id="theme-toggle"
            className="p-1.5 rounded-[7px] transition-all"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
            }}
          >
            {theme === 'dark' ? (
              <Sun style={{ width: 14, height: 14, color: 'var(--accent-amber)' }} />
            ) : (
              <Moon style={{ width: 14, height: 14, color: 'var(--accent-indigo)' }} />
            )}
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-[7px] transition-all"
          title="Refresh all feeds"
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <RefreshCw
            className={cn('transition-transform', refreshing && 'animate-spin')}
            style={{ width: 14, height: 14, color: 'var(--text-muted)' }}
          />
        </button>

        {/* Notifications */}
        <button
          className="p-1.5 rounded-[7px] transition-all relative"
          title="Notifications"
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <Bell style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
          <span
            className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
            style={{ background: '#EF4444', boxShadow: '0 0 4px rgba(239,68,68,0.6)' }}
          />
        </button>
      </div>
    </header>
  );
}
