'use client';

import { useFeeds, useCryptoMarket } from '@/hooks/use-feeds';
import { NewsCard } from '@/components/cards/news-card';
import { WeatherWidget } from '@/components/ui/weather-widget';
import { TelemetryRadarPanel } from '@/components/ui/telemetry-radar-panel';
import { FrameworkRadarPanel } from '@/components/ui/framework-radar-panel';
import { HotTrendsPanel } from '@/components/ui/hot-trends-panel';
import { TimelinePanel } from '@/components/ui/timeline-panel';
import { formatDistanceToNow } from 'date-fns';
import type { NewsItem } from '@/types';

function BreakingCard({ item }: { item: NewsItem }) {
  const timeStr = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true }).replace('about ', '');

  const open = () => window.open(item.url, '_blank', 'noopener,noreferrer');

  return (
    <div
      className="featured-card breaking home-grid-full animate-fade-in"
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      tabIndex={0}
      role="button"
      aria-label={`Open article: ${item.title}`}
    >
      <div className="featured-badge breaking">🚨 CRITICAL BREAKING ALERT</div>
      <h3>{item.title}</h3>
      {item.description && <p className="featured-summary">{item.description}</p>}
      <div className="featured-meta">
        <span className="source">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}
          >
            {item.source} ↗
          </a>
        </span>
        <span className="time-ago">{timeStr}</span>
      </div>
    </div>
  );
}

function sortHomeFeed(items: NewsItem[]): NewsItem[] {
  const techCategories = new Set(['tech', 'ai', 'github', 'research']);
  const isTechCore = (n: NewsItem) => techCategories.has(n.category);

  let filtered = [...items];
  let geoCount = 0;
  filtered = filtered.filter((item) => {
    if (item.category === 'global') return geoCount++ < 2;
    return true;
  });

  return filtered.sort((a, b) => {
    const aScore = (a.significance || 5) * (isTechCore(a) ? 1.15 : 1);
    const bScore = (b.significance || 5) * (isTechCore(b) ? 1.15 : 1);
    return bScore - aScore || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

export function ControlCenterHome() {
  const { data: globalData, isLoading } = useFeeds(undefined, 50);
  const { data: cryptoMarket } = useCryptoMarket();

  const items = globalData?.items ?? [];
  const sorted = sortHomeFeed(items);
  const breaking = sorted.find((i) => i.significance >= 9) ?? null;
  const feedItems = sorted.filter((i) => i.id !== breaking?.id).slice(0, 8);

  const githubItems = items.filter((n) => n.category === 'github').slice(0, 3);
  const researchItems = items
    .filter((n) => {
      const text = `${n.title} ${n.source} ${n.subcategory ?? ''}`;
      return (n.subcategory ?? '').toLowerCase().includes('academic') || /arxiv|preprint/i.test(text);
    })
    .sort((a, b) => (b.significance || 5) - (a.significance || 5))
    .slice(0, 5);

  return (
    <div className="dashboard-home animate-fade-in">
      <div className="control-center-hero">
        <WeatherWidget />
        <div className="welcome-section">
          <h1>Technology Control Center</h1>
          <p>Real-time AI, security, developer and research signal — prioritized by importance, not just recency.</p>
        </div>
      </div>

      <TelemetryRadarPanel assets={cryptoMarket?.assets ?? []} />

      <div className="home-grid">
        {breaking && <BreakingCard item={breaking} />}

        <div className="content-main">
          <div className="panel">
            <div className="panel-header">
              <h3>Top Technology News</h3>
              <span className="panel-action">Settings</span>
            </div>
            <div className="panel-body">
              {isLoading ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Syncing global intelligence streams…</p>
              ) : feedItems.length === 0 ? (
                <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: 8, color: 'var(--accent-red)' }}>
                    Live News Stream Unreachable
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Wait a moment and refresh — feeds may still be warming up.
                  </p>
                </div>
              ) : (
                <div className="news-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  {feedItems.map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <FrameworkRadarPanel githubItems={githubItems} researchItems={researchItems} />
        </div>

        <div className="content-sidebar">
          <HotTrendsPanel items={items} />
          <TimelinePanel items={sorted} />
        </div>
      </div>
    </div>
  );
}
