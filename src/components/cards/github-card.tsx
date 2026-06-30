'use client';

import { GithubRepo } from '@/types';
import { Star, GitFork } from 'lucide-react';

export function GithubCard({ repo, index }: { repo: GithubRepo; index?: number }) {
  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="card-terminal flex flex-col justify-between p-4 block h-[130px]"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={repo.owner.avatar_url} alt="" className="w-8 h-8 rounded-sm" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
            {repo.owner.login} / {repo.name}
          </h3>
          <p className="text-[13px] text-[var(--text-body)] mt-1 line-clamp-2 leading-snug">
            {repo.description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          {repo.language && (
            <span className="tag-terminal">
              {repo.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 label-mono">
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 text-[var(--text-muted)]" />
            {repo.stargazers_count?.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <GitFork className="w-3 h-3 text-[var(--text-muted)]" />
            {repo.forks_count?.toLocaleString()}
          </span>
        </div>
      </div>
    </a>
  );
}
