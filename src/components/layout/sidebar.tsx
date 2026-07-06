'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CATEGORIES } from '@/lib/feeds/registry';
import { CategoryNavIcon, RadarLogo } from '@/components/icons/category-nav-icon';
import { ChevronRight, Settings } from 'lucide-react';
import type { Category } from '@/types';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const TECH_CATS: Category[] = ['ai', 'tech', 'github', 'research', 'startups'];
const MARKET_CATS: Category[] = ['crypto', 'trading', 'global'];

const CAT_LABELS: Partial<Record<Category, string>> = {
  ai: 'AI & Machine Learning',
  tech: 'Technology',
  github: 'GitHub Developer',
  research: 'Science & Research',
  startups: 'Startups & VC',
  crypto: 'Crypto & DeFi',
  trading: 'Financial Trading',
  global: 'Global Geopolitics',
};

function NavLink({
  href,
  label,
  iconId,
  collapsed,
  active,
}: {
  href: string;
  label: string;
  iconId: Category | 'home';
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn('ni-nav-item w-full', active && 'active')}
    >
      <CategoryNavIcon id={iconId} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col transition-[width] duration-200"
      style={{
        width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-default)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.35)',
      }}
    >
      <div className="ni-sidebar-header">
        <div className="ni-sidebar-logo">
          <RadarLogo />
        </div>
        {!collapsed && (
          <div className="ni-sidebar-brand animate-fade-in overflow-hidden">
            <h1>NewsDash</h1>
            <span>Real-Time Intelligence</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar px-2 py-2">
        {!collapsed && <p className="ni-nav-section-title">Operations</p>}
        <NavLink
          href="/"
          label="Control Center"
          iconId="home"
          collapsed={collapsed}
          active={isActive('/')}
        />

        {!collapsed && <p className="ni-nav-section-title">Technology</p>}
        <div className="space-y-0.5">
          {TECH_CATS.map((cat) => (
            <NavLink
              key={cat}
              href={`/${cat}`}
              label={CAT_LABELS[cat] ?? CATEGORIES.find((c) => c.id === cat)?.name ?? cat}
              iconId={cat}
              collapsed={collapsed}
              active={isActive(`/${cat}`)}
            />
          ))}
        </div>

        {!collapsed && <p className="ni-nav-section-title">Markets & Global</p>}
        <div className="space-y-0.5">
          {MARKET_CATS.map((cat) => (
            <NavLink
              key={cat}
              href={`/${cat}`}
              label={CAT_LABELS[cat] ?? CATEGORIES.find((c) => c.id === cat)?.name ?? cat}
              iconId={cat}
              collapsed={collapsed}
              active={isActive(`/${cat}`)}
            />
          ))}
        </div>
      </nav>

      <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid var(--border-default)' }}>
        <button
          type="button"
          onClick={onToggle}
          className={cn('ni-nav-item w-full', collapsed && 'justify-center')}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar ([ )'}
        >
          {collapsed ? (
            <ChevronRight style={{ width: 16, height: 16, color: 'var(--text-muted)' }} />
          ) : (
            <>
              <Settings style={{ width: 16, height: 16, color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
