'use client';

import { useState } from 'react';
import { useFeeds, useCryptoMarket } from '@/hooks/use-feeds';
import { NewsCard } from '@/components/cards/news-card';
import { CryptoCard } from '@/components/cards/crypto-card';
import { SkeletonCard, SkeletonCryptoCard } from '@/components/ui/skeleton-card';
import { getCategoryInfo } from '@/lib/feeds/registry';

const TABS = ['All', 'Market', 'ETF', 'Security', 'Regulations', 'DeFi'];

export default function CryptoPage() {
  const [activeTab, setActiveTab] = useState('All');
  const { data: newsData, isLoading: newsLoading } = useFeeds('crypto', 30);
  const { data: marketData, isLoading: marketLoading } = useCryptoMarket();
  const info = getCategoryInfo('crypto');

  const filteredItems = newsData?.items?.filter(item => {
    if (activeTab === 'All') return true;
    const tabTarget = activeTab.toLowerCase();
    return item.tags.includes(tabTarget) || item.title.toLowerCase().includes(tabTarget);
  }) || [];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
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

      {/* Market Overview Top Section */}
      <div className="mb-8">
        <h2 className="text-[16px] font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Market Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {marketLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCryptoCard key={i} />)
            : marketData?.assets?.slice(0, 8).map((asset, i) => (
              <CryptoCard key={asset.id} asset={asset} index={i} />
            ))
          }
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="text-[16px] font-bold pb-4" style={{ color: 'var(--text-primary)' }}>Latest News</h2>
        
        {/* Tabs */}
        <div className="flex items-center gap-2 pb-4 overflow-x-auto no-scrollbar">
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
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {newsLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : filteredItems.map((item, i) => (
            <NewsCard key={item.id} item={item} index={i} />
          ))
        }
      </div>
      
      {!newsLoading && filteredItems.length === 0 && (
        <div className="py-20 text-center">
          <p style={{ color: 'var(--text-tertiary)' }}>No recent news found for this filter.</p>
        </div>
      )}
    </div>
  );
}
