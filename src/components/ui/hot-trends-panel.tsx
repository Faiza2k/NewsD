'use client';

import type { NewsItem } from '@/types';

interface Trend {
  topic: string;
  mentions: number;
  category: string;
}

function buildTrends(items: NewsItem[]): Trend[] {
  const counts = new Map<string, { mentions: number; category: string }>();
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  for (const item of items) {
    if (new Date(item.publishedAt).getTime() < dayAgo) continue;
    for (const tag of item.tags.slice(0, 2)) {
      const key = tag.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.mentions += 1;
      else counts.set(key, { mentions: 1, category: item.category });
    }
  }

  return [...counts.entries()]
    .map(([topic, data]) => ({ topic, ...data }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 5);
}

export function HotTrendsPanel({ items }: { items: NewsItem[] }) {
  const trends = buildTrends(items);
  const maxMentions = trends.length > 0 ? Math.max(...trends.map((t) => t.mentions)) : 1;

  return (
    <div className="panel hot-trends-panel">
      <div className="panel-header hot-trends-header">
        <div className="hot-trends-title-group">
          <h3>Global Hot Trends</h3>
          <span className="hot-trends-subtitle">Ranked by 24h story volume</span>
        </div>
        <span className="hot-trends-period">24H</span>
      </div>
      <div className="panel-body">
        <div className="hot-trends-list">
          {trends.length === 0 ? (
            <div className="hot-trends-empty">
              <p>No surge data yet — syncing live feeds.</p>
            </div>
          ) : (
            trends.map((t, idx) => {
              const rank = idx + 1;
              const surgePct = Math.round((t.mentions / maxMentions) * 100);
              const rankClass = rank <= 3 ? ` hot-trend-card--rank-${rank}` : '';
              return (
                <div
                  key={t.topic}
                  className={`hot-trend-card${rankClass}`}
                  style={{ ['--surge' as string]: `${surgePct}%`, ['--delay' as string]: `${(0.05 * idx).toFixed(2)}s` }}
                  title={`${t.mentions} stories in the last 24h`}
                  tabIndex={0}
                  role="button"
                >
                  <span className="hot-trend-rank">{rank.toString().padStart(2, '0')}</span>
                  <div className="hot-trend-body">
                    <h4>{t.topic}</h4>
                    <div className="hot-trend-meta">
                      <span className="hot-trend-mentions">
                        {t.mentions} {t.mentions === 1 ? 'story' : 'stories'} · 24h
                      </span>
                      <div className="hot-trend-bar" aria-hidden="true">
                        <div className="hot-trend-bar-fill" />
                      </div>
                    </div>
                  </div>
                  <span className="hot-trend-cat">{t.category}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
