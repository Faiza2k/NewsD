'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CATEGORIES } from '@/lib/feeds/registry';
import { LayoutDashboard, ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const CAT_ACCENT: Record<string, string> = {
  ai:       '#8B5CF6',
  crypto:   '#F59E0B',
  trading:  '#10B981',
  tech:     '#3B82F6',
  research: '#06B6D4',
  startups: '#EF4444',
  global:   '#F97316',
  github:   '#94A3B8',
};

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  const homeActive = pathname === '/';

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col',
        'transition-[width] duration-200 ease-in-out'
      )}
      style={{
        width:       collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        background:  'var(--bg-secondary)',
        borderRight: '1px solid var(--border-default)',
        boxShadow:   '4px 0 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center flex-shrink-0 overflow-hidden"
        style={{
          height:       'var(--topbar-height)',
          borderBottom: '1px solid var(--border-default)',
          padding:      '0 14px',
        }}
      >
        {/* Product mark */}
        <div
          className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
            boxShadow:  '0 0 12px rgba(59,130,246,0.4)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1.5 9.5 L6.5 2 L11.5 9.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3.5 6.5 L9.5 6.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>

        {!collapsed && (
          <div className="ml-3 animate-fade-in overflow-hidden">
            <p
              className="text-[13.5px] font-bold tracking-tight leading-none"
              style={{ color: '#FFFFFF', letterSpacing: '-0.02em' }}
            >
              NewsDash
            </p>
            <p
              className="text-[9.5px] font-semibold mt-0.5 leading-none"
              style={{
                color: 'var(--text-muted)',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
              }}
            >
              Intelligence
            </p>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-3 px-2">

        {!collapsed && (
          <p
            className="section-label px-2 pb-2"
            style={{ paddingTop: '2px' }}
          >
            Workspace
          </p>
        )}

        {/* Overview */}
        <Link
          href="/"
          title={collapsed ? 'Overview' : undefined}
          className={cn('nav-item w-full', homeActive && 'active')}
        >
          <LayoutDashboard
            style={{
              width: 15, height: 15, flexShrink: 0,
              color: homeActive ? 'var(--accent-blue)' : 'var(--text-muted)',
            }}
          />
          {!collapsed && (
            <span style={{ color: homeActive ? '#FFFFFF' : 'var(--text-secondary)' }}>
              Overview
            </span>
          )}
        </Link>

        {/* Divider */}
        <div
          className="my-3 mx-1"
          style={{ height: '1px', background: 'var(--border-subtle)' }}
        />

        {!collapsed && (
          <p className="section-label px-2 pb-2">Categories</p>
        )}

        <div className="space-y-0.5">
          {CATEGORIES.map((cat, index) => {
            const path   = `/${cat.id}`;
            const active = isActive(path);
            const accent = CAT_ACCENT[cat.id] ?? '#3B82F6';

            return (
              <Link
                key={cat.id}
                href={path}
                title={collapsed ? cat.name : undefined}
                className={cn('nav-item w-full group', active && 'active')}
              >
                {/* Active left cyan bar */}
                {active && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: 'var(--accent-cyan)' }}
                  />
                )}

                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 ml-1"
                  style={{
                    background: `var(--cat-${cat.id})`,
                    opacity: active ? 1 : 0.4
                  }}
                />

                {!collapsed && (
                  <>
                    <span
                      className="flex-1 truncate text-[13px]"
                      style={{ color: active ? 'var(--text-primary)' : 'var(--text-body)' }}
                    >
                      {cat.name}
                    </span>
                    <kbd
                      className="text-[9.5px] font-mono opacity-0 group-hover:opacity-100 transition-opacity px-1.5 rounded"
                      style={{
                        color:      'var(--text-muted)',
                        background: 'var(--bg-card)',
                        border:     '1px solid var(--border-default)',
                      }}
                    >
                      {index + 1}
                    </kbd>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Collapse toggle ── */}
      <div
        className="flex-shrink-0 p-3"
        style={{ borderTop: '1px solid var(--border-default)' }}
      >
        <button
          onClick={onToggle}
          className={cn('nav-item w-full', collapsed ? 'justify-center' : 'justify-start')}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar ([ )'}
        >
          {collapsed ? (
            <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
          ) : (
            <>
              <ChevronLeft style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
              <span className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                Collapse
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
