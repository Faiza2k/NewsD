'use client';

import { NewsItem } from '@/types';
import { formatDistanceToNow } from 'date-fns';

export function NewsCard({ item, index }: { item: NewsItem; index?: number }) {
  // Score badge logic
  const getScoreBadge = (score: number) => {
    if (score >= 8) return { class: 'high', label: 'HIGH' };
    if (score >= 5) return { class: 'mod', label: 'MODERATE' };
    return { class: 'low', label: 'LOW' };
  };

  const badge = getScoreBadge(item.significance);
  const timeStr = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true }).replace('about ', '');

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card-terminal flex flex-col justify-between p-4 h-[130px] overflow-hidden no-anim block"
    >
      <div>
        {/* Top Row: Source & Score */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {item.sourceIcon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.sourceIcon} alt="" className="w-4 h-4 rounded-sm" />
            )}
            <span className="label-mono truncate">{item.source}</span>
            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">· {timeStr}</span>
          </div>
          <div className={`badge-score ${badge.class} flex-shrink-0 ml-2`}>
            {item.significance} {badge.label}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-semibold leading-snug line-clamp-2 text-[var(--text-primary)] mb-1">
          {item.title}
        </h3>
        
        {/* Body (only if room) */}
        {item.description && (
          <p className="text-[13px] text-[var(--text-body)] line-clamp-1 leading-snug">
            {item.description}
          </p>
        )}
      </div>
    </a>
  );
}
