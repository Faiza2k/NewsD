'use client';

import { useSummary } from '@/hooks/use-summary';
import { RefreshCw, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { FEED_SOURCE_COUNT } from '@/lib/feeds/registry';
import type { CategorySummary } from '@/hooks/use-summary';

const CAT_ACCENT: Record<string, string> = {
  ai:       '#8B5CF6',
  crypto:   '#F59E0B',
  trading:  '#10B981',
  github:   '#94A3B8',
  tech:     '#3B82F6',
  research: '#06B6D4',
  startups: '#EF4444',
  global:   '#F97316',
};

function CategoryCard({ item }: { item: CategorySummary }) {
  const accent = CAT_ACCENT[item.categoryId] ?? '#3B82F6';

  return (
    <div
      className="summary-card flex flex-col"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {/* Card Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}18` }}
        >
          <span className="text-[14px]">{item.category === 'Artificial Intelligence' ? '🤖' : item.category === 'Cryptocurrency' ? '₿' : item.category === 'Trading & Markets' ? '📈' : item.category === 'GitHub Innovation' ? '💻' : item.category === 'Technology' ? '🚀' : item.category === 'Research' ? '📚' : item.category === 'Startups & Funding' ? '💼' : '🌍'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {item.category}
          </h3>
          <span className="label-mono" style={{ color: accent }}>
            {item.headlines.length} updates
          </span>
        </div>
      </div>

      {/* AI Summary */}
      <p className="text-[13px] leading-[1.65] mb-3 flex-1" style={{ color: 'var(--text-body)' }}>
        {item.summary}
      </p>

      {/* Headlines */}
      {item.headlines.length > 0 && (
        <div className="space-y-1.5 pt-2.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          {item.headlines.map((headline, i) => (
            <div key={`${headline.url}-${i}`} className="flex items-start gap-2">
              <span
                className="text-[9px] font-mono font-bold mt-[3px] flex-shrink-0 w-3.5 text-right"
                style={{ color: accent }}
              >
                {i + 1}
              </span>
              <a
                href={headline.url}
                target="_blank"
                rel="noopener noreferrer"
                className="summary-headline-link text-[11.5px] leading-snug line-clamp-2"
                style={{ color: 'var(--text-muted)', ['--headline-accent' as string]: accent }}
              >
                {headline.title}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AISummaryPanel() {
  const { data, isLoading, isValidating, error, mutate, forceRefresh } = useSummary();
  const isUpdating = isLoading || isValidating;

  // Detect if AI fallback is active (summary contains "Top stories:" or "No headlines")
  const hasAiFallback = data?.summaries?.some(s =>
    s.summary.startsWith('Top stories:') || s.summary.startsWith('No headlines')
  );

  return (
    <div className="ai-brief-panel">
      {/* Header */}
      <div className="ai-brief-header">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: hasAiFallback ? 'var(--accent-amber)' : 'var(--accent-cyan)' }} />
            <span className="font-bold text-[15px]" style={{ color: 'var(--text-primary)' }}>
              {hasAiFallback ? 'Intelligence Brief' : 'AI Intelligence Brief'}
            </span>
          </div>
          <span className="tag-terminal">
            {hasAiFallback ? 'Live Headlines' : 'Groq · LLaMA 3.3 70B'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="label-mono">
            {data?.generatedAt ? `Updated ${formatDistanceToNow(new Date(data.generatedAt))} ago` : 'Compiling...'}
          </span>
          <button
            onClick={() => forceRefresh()}
            disabled={isUpdating}
            className={`p-1.5 rounded-md transition-colors ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--bg-hover)]'}`}
            title="Force refresh (bypass cache)"
            style={{ color: 'var(--text-muted)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="ai-brief-content">
        {error ? (
          <div className="col-span-full py-8 text-center">
            <p className="text-[13px]" style={{ color: 'var(--accent-red)' }}>
              Intelligence feed unavailable. Check your GROQ_API_KEY.
            </p>
          </div>
        ) : isUpdating && !data ? (
          <div className="col-span-full py-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <p className="label-mono" style={{ color: 'var(--text-muted)' }}>
              Compiling intelligence from {FEED_SOURCE_COUNT} sources...
            </p>
          </div>
        ) : data?.summaries ? (
          data.summaries.map((item) => (
            <CategoryCard key={item.categoryId} item={item} />
          ))
        ) : null}
      </div>
    </div>
  );
}
