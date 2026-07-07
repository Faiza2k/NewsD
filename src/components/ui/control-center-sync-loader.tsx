'use client';

import { useEffect, useMemo, useState } from 'react';

type SyncStep = {
  id: string;
  label: string;
  status: string;
};

const RADAR_SIZE = 92;

export function ControlCenterSyncLoader() {
  const steps: SyncStep[] = useMemo(
    () => [
      { id: 'market', label: 'Market Telemetry', status: 'Calibrating market telemetry…' },
      { id: 'weather', label: 'Weather & Location', status: 'Resolving weather & location…' },
      { id: 'feeds', label: 'Global News Feeds', status: 'Linking global news feeds…' },
      { id: 'ui', label: 'Control Center UI', status: 'Booting control center UI…' },
    ],
    [],
  );

  const [active, setActive] = useState(1); // match screenshot default
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIsUpdating(true);
      window.setTimeout(() => setIsUpdating(false), 240);
      setActive((i) => (i + 1) % steps.length);
    }, 1450);

    return () => window.clearInterval(interval);
  }, [steps.length]);

  const current = steps[active] ?? steps[0]!;

  return (
    <div className="cc-sync-loader" role="status" aria-live="polite" aria-label="Synchronizing Command Center">
      <div className="cc-sync-loader-inner">
        <div className="cc-sync-radar" aria-hidden="true">
          <svg
            className="cc-sync-radar-svg"
            width={RADAR_SIZE}
            height={RADAR_SIZE}
            viewBox="0 0 72 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle className="cc-radar-ring--outer" cx="36" cy="36" r="28" stroke="currentColor" strokeWidth="2" />
            <circle className="cc-radar-ring--mid" cx="36" cy="36" r="18" stroke="currentColor" strokeWidth="2" />
            <circle className="cc-radar-ring--core" cx="36" cy="36" r="3" fill="currentColor" />
            <path className="cc-radar-sweep" d="M36 36L62 28C63.5 33.2 63.5 38.8 62 44L36 36Z" fill="currentColor" opacity="0.22" />
            <path d="M36 36L50 22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
            <circle cx="50" cy="22" r="3.2" fill="currentColor" />
          </svg>
        </div>

        <h2 className="cc-sync-title">Synchronizing Command Center</h2>
        <p className={`cc-sync-status${isUpdating ? ' is-updating' : ''}`}>{current.status}</p>

        <div className="cc-sync-progress" aria-hidden="true">
          <span className="cc-sync-progress-bar" />
        </div>

        <div className="cc-sync-steps" aria-label="Startup sequence">
          {steps.map((s, idx) => (
            <span key={s.id} className={`cc-sync-step${idx === active ? ' is-active' : ''}`}>
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="cc-sync-skeleton" aria-hidden="true">
        <div className="cc-sync-skeleton-hero" />
        <div className="cc-sync-skeleton-grid">
          <div className="cc-sync-skeleton-card" />
          <div className="cc-sync-skeleton-card" />
          <div className="cc-sync-skeleton-card" />
          <div className="cc-sync-skeleton-card" />
        </div>
      </div>
    </div>
  );
}

