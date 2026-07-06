'use client';

import { formatRelativeTime, truncate } from '@/lib/utils';
import type { ResearchPaper } from '@/types';

export function ResearchCard({ paper }: { paper: ResearchPaper; index?: number }) {
  return (
    <div className="news-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="news-card-top">
        <span className="source" style={{ color: '#a855f7', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
          {paper.categories.slice(0, 2).join(' · ')}
        </span>
        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
          {formatRelativeTime(paper.publishedAt)}
        </span>
      </div>
      <h4 style={{ marginTop: 4 }}>
        <a
          href={paper.arxivUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
        >
          {paper.title}
        </a>
      </h4>
      <p className="news-card-summary" style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
        {paper.authors.slice(0, 3).join(', ')}
        {paper.authors.length > 3 ? ` +${paper.authors.length - 3} more` : ''}
      </p>
      <p className="news-card-summary">{truncate(paper.abstract, 200)}</p>
      <div className="news-card-meta" style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href={paper.pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>
          PDF ↗
        </a>
        <a href={paper.arxivUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>
          arXiv ↗
        </a>
        {paper.githubUrl && (
          <a href={paper.githubUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>
            Code ↗
          </a>
        )}
      </div>
    </div>
  );
}
