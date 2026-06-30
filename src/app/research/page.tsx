'use client';

import { useState } from 'react';
import { useResearchPapers } from '@/hooks/use-feeds';
import { ResearchCard } from '@/components/cards/research-card';
import { SkeletonCard } from '@/components/ui/skeleton-card';
import { getCategoryInfo } from '@/lib/feeds/registry';

const TABS = ['All', 'cs.AI', 'cs.LG', 'cs.CL', 'cs.CV'];

export default function ResearchPage() {
  const [activeTab, setActiveTab] = useState('All');
  const { data, isLoading } = useResearchPapers();
  const info = getCategoryInfo('research');

  const filteredItems = data?.papers?.filter(paper => {
    if (activeTab === 'All') return true;
    return paper.categories.includes(activeTab);
  }) || [];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl text-white"
               style={{ background: info?.gradient }}>
            {info?.icon}
          </div>
          <h1 className="text-[28px] font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {info?.name} Intelligence
          </h1>
        </div>
        <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
          {info?.description}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors flex-shrink-0"
            style={{
              background: activeTab === tab ? 'var(--text-primary)' : 'var(--bg-tertiary)',
              color: activeTab === tab ? 'var(--bg-primary)' : 'var(--text-secondary)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
          : filteredItems.map((paper, i) => (
            <ResearchCard key={paper.id} paper={paper} index={i} />
          ))
        }
      </div>
      
      {!isLoading && filteredItems.length === 0 && (
        <div className="py-20 text-center">
          <p style={{ color: 'var(--text-tertiary)' }}>No recent papers found for this filter.</p>
        </div>
      )}
    </div>
  );
}
