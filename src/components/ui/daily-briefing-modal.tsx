'use client';

import { useState } from 'react';
import type { BriefingArticle, DailyBriefing } from '@/lib/briefing/build-briefing';
import { formatBriefingTime } from '@/lib/briefing/build-briefing';
import { useBriefingData, useRefreshBriefing } from '@/hooks/use-briefing';

interface DailyBriefingModalProps {
  open: boolean;
  onClose: () => void;
}

function BriefingBullets({ items }: { items: BriefingArticle[] }) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: 0 }}>
        No stories in this section yet — syncing live feeds.
      </p>
    );
  }

  return (
    <>
      {items.map((n) => (
        <div
          key={n.id}
          className="briefing-bullet"
          style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}
        >
          {n.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={n.imageUrl}
              alt=""
              style={{
                width: 68,
                height: 68,
                objectFit: 'cover',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                flexShrink: 0,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
              >
                {n.title}{' '}
                <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>↗</span>
              </a>
            </strong>
            <p style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {n.description}
            </p>
            <p
              style={{
                marginTop: 4,
                fontSize: '0.68rem',
                color: 'var(--text-tertiary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              {n.source} · {formatBriefingTime(n.publishedAt)}
            </p>
          </div>
        </div>
      ))}
    </>
  );
}

function BriefingSection({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  const dotStyle = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
    boxShadow: `0 0 8px ${color}`,
  };

  return (
    <div
      style={{
        marginBottom: 0,
        padding: '20px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h3
        style={{
          fontSize: '0.92rem',
          fontWeight: 700,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        <span style={dotStyle} />
        {title}
      </h3>
      <div style={{ paddingLeft: 18, borderLeft: `2px solid ${color}40` }}>{children}</div>
    </div>
  );
}

function BriefingContent({ briefing }: { briefing: DailyBriefing }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div
        style={{
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: '2px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="briefing-title-row">
          <div>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                marginBottom: 6,
              }}
            >
              Today&apos;s Executive Briefing
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                margin: 0,
              }}
            >
              {briefing.date} &bull; Last synced {briefing.lastUpdated}
            </p>
          </div>
        </div>
      </div>

      <BriefingSection title="Critical Intelligence" color="#ef4444">
        <BriefingBullets items={briefing.breakingHighlights} />
      </BriefingSection>

      <BriefingSection title="Tech & AI Innovation" color="#06b6d4">
        <BriefingBullets items={briefing.techUpdates} />
      </BriefingSection>

      <BriefingSection title="Open Source & GitHub" color="#6366f1">
        <BriefingBullets items={briefing.githubUpdates} />
      </BriefingSection>

      <BriefingSection title="Science & Research" color="#a855f7">
        <BriefingBullets items={briefing.researchHighlights} />
      </BriefingSection>

      <BriefingSection title="Startups & Venture Capital" color="#f59e0b">
        <BriefingBullets items={briefing.startupUpdates} />
      </BriefingSection>

      <BriefingSection title="Markets & Commodities" color="#64748b">
        <BriefingBullets items={briefing.marketSummary} />
      </BriefingSection>

      <BriefingSection title="Geopolitics & Policy" color="#64748b">
        <BriefingBullets items={briefing.geopoliticsUpdates} />
      </BriefingSection>

      <div style={{ paddingTop: 20 }}>
        <h3
          style={{
            fontSize: '0.92rem',
            fontWeight: 700,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#10b981',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
            }}
          />
          Key Events Timeline
        </h3>
        <div
          className="timeline-list"
          style={{ paddingLeft: 18, borderLeft: '2px solid rgba(16,185,129,0.25)' }}
        >
          {briefing.topEvents.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Syncing timeline…</p>
          ) : (
            briefing.topEvents.map((event) => (
              <div
                key={event.rank}
                className="briefing-item"
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: 'var(--accent-emerald)',
                      background: 'rgba(16,185,129,0.1)',
                      padding: '3px 8px',
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    {event.rank.toString().padStart(2, '0')}
                  </span>
                  <div>
                    <h4 style={{ fontSize: '0.82rem', fontWeight: 700, margin: '0 0 4px', lineHeight: 1.4 }}>
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {event.title}{' '}
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>↗</span>
                      </a>
                    </h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      {event.summary}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function DailyBriefingModal({ open, onClose }: DailyBriefingModalProps) {
  const { data, isLoading, error, refetch, isFetching } = useBriefingData(open);
  const refreshBriefing = useRefreshBriefing();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshBriefing();
    } catch {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      id="global-modal-overlay"
      className={`modal-overlay${open ? ' open' : ''}`}
      onClick={handleOverlayClick}
      aria-hidden={!open}
    >
      <div className="modal briefing-modal" role="dialog" aria-modal="true" aria-label="Daily Executive Briefing">
        <div className="modal-header">
          <h2 id="modal-title" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary briefing-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing || isFetching}
              aria-label="Refresh executive briefing feed"
            >
              🔄 Refresh Feed
            </button>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
              ✕
            </button>
          </div>
        </div>
        <div className="modal-body" id="modal-body-content">
          {isLoading && !data ? null : error ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--accent-red)', marginBottom: 12 }}>Could not load briefing.</p>
              <button type="button" className="btn btn-primary" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : data ? (
            <BriefingContent briefing={data} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
