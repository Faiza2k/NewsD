'use client';

import { FileText, Users, ExternalLink, Code } from 'lucide-react';
import { formatRelativeTime, truncate } from '@/lib/utils';
import type { ResearchPaper } from '@/types';

interface ResearchCardProps {
  paper: ResearchPaper;
  index?: number;
}

export function ResearchCard({ paper, index = 0 }: ResearchCardProps) {
  return (
    <article
      className="card-premium p-4 animate-fade-in-up group"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* Category tags */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {paper.categories.slice(0, 3).map(cat => (
          <span key={cat} className="tag tag-purple">
            {cat}
          </span>
        ))}
        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-tertiary)' }}>
          {formatRelativeTime(paper.publishedAt)}
        </span>
      </div>

      {/* Title */}
      <a
        href={paper.arxivUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block group/link"
      >
        <h3 className="text-[14px] font-semibold leading-snug mb-2 group-hover/link:text-[var(--accent-indigo)] transition-colors"
          style={{ color: 'var(--text-primary)' }}>
          {paper.title}
        </h3>
      </a>

      {/* Authors */}
      <div className="flex items-center gap-1.5 mb-2">
        <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <p className="text-[11.5px] truncate" style={{ color: 'var(--text-secondary)' }}>
          {paper.authors.slice(0, 3).join(', ')}
          {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
        </p>
      </div>

      {/* Abstract */}
      <p className="text-[12px] leading-relaxed mb-3 line-clamp-3"
        style={{ color: 'var(--text-secondary)' }}>
        {truncate(paper.abstract, 250)}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t"
        style={{ borderColor: 'var(--border-subtle)' }}>
        <a
          href={paper.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors hover:opacity-80"
          style={{
            background: 'var(--accent-indigo-soft)',
            color: 'var(--accent-indigo)',
          }}
        >
          <FileText className="w-3.5 h-3.5" />
          View PDF
        </a>
        <a
          href={paper.arxivUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors hover:opacity-80"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
          }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          arXiv
        </a>
        {paper.githubUrl && (
          <a
            href={paper.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors hover:opacity-80"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            <Code className="w-3.5 h-3.5" />
            Code
          </a>
        )}
      </div>
    </article>
  );
}
