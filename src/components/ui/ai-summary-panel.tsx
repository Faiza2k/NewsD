'use client';

import { useState } from 'react';
import { useSummary } from '@/hooks/use-summary';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function SummaryRow({ item, index, isLast }: { item: any, index: number, isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="p-4 transition-colors hover:bg-[var(--bg-hover)] flex gap-4"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--border-default)',
      }}
    >
      {/* CATEGORY PILL */}
      <div className="w-[80px] flex-shrink-0 flex items-start gap-1.5 mt-1">
        <div className="w-1.5 h-1.5 rounded-full mt-[3px]" style={{ background: `var(--cat-${item.categoryId})` }} />
        <span className="label-mono truncate" title={item.category}>{item.category}</span>
      </div>

      {/* SUMMARY */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-[14px] text-[var(--text-body)] leading-[1.6] ${!expanded ? 'line-clamp-2' : ''}`}
          style={{ transition: 'height var(--t-fast)' }}
        >
          {item.summary}
        </p>
        
        {/* Toggle Headlines */}
        {item.headlines?.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 label-mono hover:text-[var(--text-primary)] transition-colors"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Source Headlines
            </button>
            
            {expanded && (
              <div className="mt-3 pl-2 border-l-2 border-[var(--border-default)] space-y-2">
                {item.headlines.map((headline: string, i: number) => (
                  <p key={i} className="text-[12px] text-[var(--text-muted)] line-clamp-1" title={headline}>
                    {headline}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AISummaryPanel() {
  const { data, isLoading, isValidating, error, mutate } = useSummary();

  const isUpdating = isLoading || isValidating;

  return (
    <div
      className="card-terminal flex flex-col"
      style={{ borderLeft: '3px solid var(--accent-cyan)' }}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[14px] text-[var(--text-primary)]">AI Brief</span>
          <span className="tag-terminal">Groq · LLaMA 3.3 70B</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="label-mono">
            {data?.generatedAt ? `Updated ${formatDistanceToNow(new Date(data.generatedAt))} ago` : 'Updating...'}
          </span>
          <button
            onClick={() => mutate()}
            disabled={isUpdating}
            className={`text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Refresh Summary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid of Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {error ? (
          <div className="col-span-2 p-6 text-center text-[var(--accent-red)] text-[13px]">
            Intelligence feed unavailable.
          </div>
        ) : isUpdating && !data ? (
          <div className="col-span-2 p-6 text-center text-[var(--text-muted)] label-mono">
            Compiling intelligence...
          </div>
        ) : data?.summaries ? (
          data.summaries.map((item, index) => (
            <div
              key={item.categoryId}
              className="min-w-0"
              style={{
                borderRight: index % 2 === 0 ? '1px solid var(--border-default)' : 'none',
              }}
            >
              <SummaryRow
                item={item}
                index={index}
                isLast={index >= data.summaries.length - 2}
              />
            </div>
          ))
        ) : null}
      </div>
    </div>
  );
}
