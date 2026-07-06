'use client';

import type { NewsItem } from '@/types';
import { formatDistanceToNow } from 'date-fns';

function RadarLink({ item }: { item: NewsItem }) {
  const timeStr = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true }).replace('about ', '');

  return (
    <div className="briefing-bullet" style={{ marginBottom: 10 }}>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: 'var(--text-primary)',
          textDecoration: 'none',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          gap: 4,
          alignItems: 'baseline',
        }}
      >
        <span style={{ flex: 1 }}>{item.title}</span>
        <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', flexShrink: 0 }}>↗</span>
      </a>
      <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
        {item.source} · {timeStr}
      </p>
    </div>
  );
}

export function FrameworkRadarPanel({
  githubItems,
  researchItems,
}: {
  githubItems: NewsItem[];
  researchItems: NewsItem[];
}) {
  if (githubItems.length === 0 && researchItems.length === 0) return null;

  return (
    <div className="panel framework-radar-panel">
      <div className="panel-header">
        <h3>Framework & Research Radar</h3>
      </div>
      <div className="panel-body framework-radar-body">
        {githubItems.length > 0 && (
          <div className="framework-radar-col">
            <p
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--accent-blue)',
                margin: '0 0 8px',
              }}
            >
              Trending on GitHub
            </p>
            {githubItems.map((item) => (
              <RadarLink key={item.id} item={item} />
            ))}
          </div>
        )}
        {researchItems.length > 0 && (
          <div className="framework-radar-col">
            <p
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#a855f7',
                margin: '0 0 8px',
              }}
            >
              Latest Research Papers
            </p>
            {researchItems.map((item) => (
              <RadarLink key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
