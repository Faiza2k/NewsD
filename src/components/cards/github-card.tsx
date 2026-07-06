'use client';

import { GithubRepo } from '@/types';

export function GithubCard({ repo }: { repo: GithubRepo }) {
  return (
    <div
      className="news-card animate-fade-in"
      onClick={() => window.open(repo.html_url, '_blank', 'noopener,noreferrer')}
      onKeyDown={(e) => e.key === 'Enter' && window.open(repo.html_url, '_blank', 'noopener,noreferrer')}
      tabIndex={0}
      role="button"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div className="news-card-top">
        <span className="source" style={{ color: 'var(--accent-cyan)', fontSize: '0.7rem' }}>
          {repo.language || 'Open Source'}
        </span>
        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
          ★ {repo.stargazers_count?.toLocaleString()} · ⑂ {repo.forks_count?.toLocaleString()}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={repo.owner.avatar_url}
          alt=""
          style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <h4 style={{ margin: 0 }}>
            {repo.owner.login}/{repo.name}
          </h4>
          {repo.description && (
            <p className="news-card-summary" style={{ marginTop: 4 }}>
              {repo.description}
            </p>
          )}
        </div>
      </div>
      {repo.topics && repo.topics.length > 0 && (
        <div className="featured-tags" style={{ marginTop: 'auto', paddingTop: 10 }}>
          {repo.topics.slice(0, 3).map((t) => (
            <span key={t} className="tag">#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
