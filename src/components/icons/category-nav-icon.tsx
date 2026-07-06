'use client';

import type { ReactNode } from 'react';
import type { Category } from '@/types';

const STROKE = 2;

export function HomeNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function RadarLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5.5" stroke="#38bdf8" strokeOpacity="0.85" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.2" fill="#38bdf8" stroke="#00f2fe" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeWidth={STROKE} />
      <line x1="12" y1="12" x2="18.5" y2="5.5" stroke="#00f2fe" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

const ICONS: Record<Category | 'home', () => ReactNode> = {
  home: HomeNavIcon,
  ai: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v2M15 1v2M9 21v2M15 21v2M21 9h2M21 15h2M1 9h2M1 15h2" />
    </svg>
  ),
  tech: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </svg>
  ),
  github: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  ),
  research: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2.5" fill="#a855f7" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(30 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-30 12 12)" />
    </svg>
  ),
  startups: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71.79-1.81.79-1.81l-3-3s-1.1.08-1.79.81z" />
      <path d="M15 9l-6 6" />
      <path d="M9 15l-3-3 7.86-7.86a4 4 0 0 1 5.66 0l.34.34a4 4 0 0 1 0 5.66L9 15z" />
    </svg>
  ),
  crypto: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  trading: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  global: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

export function CategoryNavIcon({ id }: { id: Category | 'home' }) {
  const Icon = ICONS[id];
  return <span className="ni-nav-item-icon">{Icon()}</span>;
}
