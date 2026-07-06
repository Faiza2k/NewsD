'use client';

import { NewsItem } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ImportanceScore } from '@/components/ui/importance-score';

export function NewsCard({ item }: { item: NewsItem; index?: number }) {
  const timeStr = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true }).replace('about ', '');

  const openArticle = () => {
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="news-card animate-fade-in"
      onClick={openArticle}
      onKeyDown={(e) => e.key === 'Enter' && openArticle()}
      tabIndex={0}
      role="button"
      aria-label={`Open article: ${item.title}`}
    >
      <div className="news-card-top">
        <span
          className="source"
          style={{
            textTransform: 'uppercase',
            fontSize: '0.65rem',
            fontWeight: 700,
            color: 'var(--accent-cyan)',
          }}
        >
          {item.category}
        </span>
        <span className="text-muted time-ago" style={{ fontSize: '0.7rem' }}>
          {timeStr}
        </span>
      </div>
      <h4 style={{ marginTop: 4 }}>{item.title}</h4>
      {item.description && <p className="news-card-summary">{item.description}</p>}
      <div className="news-card-meta">
        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
          Source:{' '}
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
        <ImportanceScore score={item.significance} />
      </div>
    </div>
  );
}
