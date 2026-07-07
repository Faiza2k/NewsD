'use client';

import { useState } from 'react';
import { useFeeds } from '@/hooks/use-feeds';
import { NewsCard } from '@/components/cards/news-card';
import { ImportanceScore } from '@/components/ui/importance-score';
import { formatDistanceToNow } from 'date-fns';
import type { Category, NewsItem } from '@/types';

export interface ModulePageConfig {
  title: string;
  subtitle: string;
  icon?: string;
  iconClass?: string;
  category?: Category;
  moduleId?: string;
  subcategories: string[];
  showLive?: boolean;
}

function FeaturedCard({ item }: { item: NewsItem }) {
  const timeStr = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true }).replace('about ', '');
  const isBreaking = item.significance >= 9;
  const open = () => window.open(item.url, '_blank', 'noopener,noreferrer');

  return (
    <div
      className={`featured-card ${isBreaking ? 'breaking' : ''} animate-fade-in`}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      tabIndex={0}
      role="button"
      aria-label={`Open article: ${item.title}`}
    >
      <div style={{ display: 'flex', gap: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', width: '100%' }}>
        {item.imageUrl && (
          <div className="featured-thumbnail-container" style={{ flex: '1 1 200px', maxWidth: '100%' }}>
            <img
              src={item.imageUrl}
              alt={item.title}
              className="card-thumbnail featured-thumbnail"
              onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
              style={{ width: '100%', height: 'auto', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
            />
          </div>
        )}
        <div style={{ flex: '2 1 300px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <div className={`featured-badge ${isBreaking ? 'breaking' : 'featured'}`} style={{ margin: 0 }}>
              {isBreaking ? 'BREAKING INTELLIGENCE' : 'FEATURED REPORT'}
            </div>
            {item.subcategory && (
              <span
                className="card-badge subcategory"
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  color: 'var(--accent-indigo)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {item.subcategory}
              </span>
            )}
          </div>
          <h3>{item.title}</h3>
          <div className="featured-meta">
            <span className="source">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'var(--accent-cyan)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}
              >
                {item.source} ↗
              </a>
            </span>
            <span className="time-ago">{timeStr}</span>
            <ImportanceScore score={item.significance} />
          </div>
          {item.description && <p className="featured-summary">{item.description}</p>}
          {item.tags.length > 0 && (
            <div className="featured-tags">
              {item.tags.slice(0, 4).map((t) => (
                <span key={t} className="tag">#{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function filterBySubcategory(items: NewsItem[], subcategory: string): NewsItem[] {
  if (subcategory === 'All') return items;
  const target = subcategory.toLowerCase().replace(/&/g, 'and');
  const targetSlug = target.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const targetWords = target.split(/[^a-z0-9]+/).filter((w) => w.length > 2);

  return items.filter((item) => {
    const hay = `${item.subcategory ?? ''} ${item.tags.join(' ')} ${item.title} ${item.source}`
      .toLowerCase()
      .replace(/&/g, 'and');
    const haySlug = hay.replace(/[^a-z0-9]+/g, '-');
    if (haySlug.includes(targetSlug) || hay.includes(target)) return true;
    return targetWords.length > 0 && targetWords.every((w) => hay.includes(w));
  });
}

export function ModulePageLayout({ config }: { config: ModulePageConfig }) {
  const [activeTab, setActiveTab] = useState('All');
  const { data, isLoading } = useFeeds(config.category, 50, config.moduleId);

  const allItems = data?.items ?? [];
  const filtered = filterBySubcategory(allItems, activeTab);

  const sortedByImportance = [...filtered].sort((a, b) => {
    const aScore = (a.significance >= 9 ? 100 : 0) + (a.significance || 5);
    const bScore = (b.significance >= 9 ? 100 : 0) + (b.significance || 5);
    return bScore - aScore || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const featured = sortedByImportance[0];
  const gridNews = filtered
    .filter((item) => item.id !== featured?.id)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return (
    <>
      <div className="module-header animate-fade-in">
        <div className="module-header-top">
          <div className="module-title-group">
            {config.icon && (
              <div className={`module-icon ${config.iconClass ?? ''}`}>{config.icon}</div>
            )}
            <div className="module-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2>{config.title}</h2>
                {config.showLive && (
                  <span
                    className="live-indicator"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.72rem',
                      color: 'var(--accent-emerald)',
                      background: 'rgba(16, 185, 129, 0.08)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      fontWeight: 600,
                    }}
                  >
                    <span
                      className="live-dot"
                      style={{
                        width: 6,
                        height: 6,
                        backgroundColor: 'var(--accent-emerald)',
                        borderRadius: '50%',
                        boxShadow: '0 0 8px var(--accent-emerald)',
                      }}
                    />
                    Live · auto-refreshing
                  </span>
                )}
              </div>
              <p>{config.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="category-tabs" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', width: '100%' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {config.subcategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`cat-tab${activeTab === cat ? ' active' : ''}`}
                onClick={() => setActiveTab(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="content-grid">
        <div className="content-main">
          {isLoading ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', padding: '20px 0' }}>
              Synchronizing intelligence feed…
            </p>
          ) : (
            <>
              {featured && <FeaturedCard item={featured} />}
              {gridNews.length > 0 ? (
                <div className="news-grid">
                  {gridNews.map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              ) : !featured ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>No intelligence reports found</h3>
                  <p>Try switching sub-categories or search for a different topic.</p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
