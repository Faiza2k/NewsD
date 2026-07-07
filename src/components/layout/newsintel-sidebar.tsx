'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MODULE_HREFS: Record<string, string> = {
  home: '/',
  technology: '/tech',
  ai: '/ai',
  cybersecurity: '/cybersecurity',
  clouddevops: '/cloud-devops',
  github: '/github',
  science: '/research',
  startups: '/startups',
  crypto: '/crypto',
  forex: '/forex',
  gold: '/gold',
  trading: '/trading',
  geopolitics: '/global',
};

function activeModule(pathname: string): string {
  if (pathname === '/') return 'home';
  const seg = pathname.split('/').filter(Boolean)[0];
  const reverse: Record<string, string> = {
    tech: 'technology',
    ai: 'ai',
    github: 'github',
    research: 'science',
    startups: 'startups',
    crypto: 'crypto',
    trading: 'trading',
    global: 'geopolitics',
    'cloud-devops': 'clouddevops',
    forex: 'forex',
    gold: 'gold',
    cybersecurity: 'cybersecurity',
  };
  return reverse[seg] ?? 'home';
}

function NavItem({ module, children }: { module: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = activeModule(pathname);
  const isActive = current === module;
  const href = MODULE_HREFS[module] ?? '/';

  return (
    <Link
      href={href}
      className={`nav-item${isActive ? ' active' : ''}`}
      data-module={module}
    >
      {children}
    </Link>
  );
}

export function NewsIntelSidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo" id="sidebar-logo-container">
          <svg className="anim-radar" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="5.5" stroke="#38bdf8" strokeOpacity="0.85" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2.2" fill="#38bdf8" stroke="#00f2fe" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="#38bdf8" strokeWidth="2" />
            <line x1="12" y1="12" x2="18.5" y2="5.5" stroke="#00f2fe" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="sidebar-brand">
          <h1>NewsDash</h1>
          <span>Real-Time Intelligence</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Operations</div>
        <NavItem module="home">
          <span className="nav-item-icon">
            <svg className="anim-icon-home" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
          </span>
          <span>Control Center</span>
        </NavItem>

        <div className="nav-section-title">Technology</div>

        <NavItem module="technology">
          <span className="nav-item-icon">
            <svg className="anim-icon-tech" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></svg>
          </span>
          <span>Technology</span>
        </NavItem>

        <NavItem module="ai">
          <span className="nav-item-icon">
            <svg className="anim-icon-ai" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v2M15 1v2M9 21v2M15 21v2M21 9h2M21 15h2M1 9h2M1 15h2" /></svg>
          </span>
          <span>AI & Machine Learning</span>
        </NavItem>

        <NavItem module="cybersecurity">
          <span className="nav-item-icon">
            <svg className="anim-icon-cyber" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </span>
          <span>Cybersecurity</span>
        </NavItem>

        <NavItem module="clouddevops">
          <span className="nav-item-icon">
            <svg className="anim-icon-cloud" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
          </span>
          <span>Cloud & DevOps</span>
        </NavItem>

        <NavItem module="github">
          <span className="nav-item-icon">
            <svg className="anim-icon-github" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>
          </span>
          <span>GitHub Developer</span>
        </NavItem>

        <NavItem module="science">
          <span className="nav-item-icon">
            <svg className="anim-icon-science" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.5" fill="#a855f7" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(30 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-30 12 12)" /></svg>
          </span>
          <span>Science & Research</span>
        </NavItem>

        <NavItem module="startups">
          <span className="nav-item-icon">
            <svg className="anim-icon-startups" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71.79-1.81.79-1.81l-3-3s-1.1.08-1.79.81z" /><path d="M15 9l-6 6" /><path d="M9 15l-3-3 7.86-7.86a4 4 0 0 1 5.66 0l.34.34a4 4 0 0 1 0 5.66L9 15z" /></svg>
          </span>
          <span>Startups & VC</span>
        </NavItem>

        <div className="nav-section-title">Markets & Global</div>

        <NavItem module="crypto">
          <span className="nav-item-icon">
            <svg className="anim-icon-crypto" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
          </span>
          <span>Crypto & DeFi</span>
        </NavItem>

        <NavItem module="forex">
          <span className="nav-item-icon">
            <svg className="anim-icon-forex" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4M7 4L3 8M7 4L11 8" /><path d="M17 8V20M17 20L21 16M17 20L13 16" /></svg>
          </span>
          <span>Forex Market</span>
        </NavItem>

        <NavItem module="gold">
          <span className="nav-item-icon">
            <svg className="anim-icon-gold" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          </span>
          <span>Gold & Metals</span>
        </NavItem>

        <NavItem module="trading">
          <span className="nav-item-icon">
            <svg className="anim-icon-trading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          </span>
          <span>Financial Trading</span>
        </NavItem>

        <NavItem module="geopolitics">
          <span className="nav-item-icon">
            <svg className="anim-icon-geopolitics" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          </span>
          <span>Global Geopolitics</span>
        </NavItem>
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-footer-btn" onClick={() => {}}>
          <span>
            <svg className="anim-icon-settings" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </span>
          <span>Feed Settings</span>
        </button>
      </div>
    </aside>
  );
}
