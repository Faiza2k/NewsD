'use client';

import { useState } from 'react';
import { useFeeds, useCryptoMarket } from '@/hooks/use-feeds';
import { NewsCard } from '@/components/cards/news-card';
import { CryptoCard } from '@/components/cards/crypto-card';
import { MODULE_CONFIGS } from '@/lib/module-configs';
import { useBriefing } from '@/components/providers/briefing-provider';

const NEWS_TABS = ['All', 'Market', 'ETF', 'Security', 'Regulations', 'DeFi'];

export default function CryptoPage() {
  const [activeTab, setActiveTab] = useState('All');
  const config = MODULE_CONFIGS.crypto;
  const { data: newsData, isLoading: newsLoading } = useFeeds('crypto', 30);
  const { data: marketData, isLoading: marketLoading } = useCryptoMarket();

  const filteredItems =
    newsData?.items?.filter((item) => {
      if (activeTab === 'All') return true;
      const tabTarget = activeTab.toLowerCase();
      return item.tags.includes(tabTarget) || item.title.toLowerCase().includes(tabTarget);
    }) ?? [];

  const { openBriefing } = useBriefing();

  return (
    <>
      <div className="module-header animate-fade-in">
        <div className="module-header-top">
          <div className="module-title-group">
            <div className={`module-icon ${config.iconClass}`}>{config.icon}</div>
            <div className="module-title">
              <h2>{config.title}</h2>
              <p>{config.subtitle}</p>
            </div>
          </div>
          <div className="module-actions">
            <button type="button" className="btn btn-primary" onClick={openBriefing}>
              Daily Briefing
            </button>
          </div>
        </div>
      </div>

      <div className="content-grid">
        <div className="content-main">
          <div className="panel telemetry-radar-panel" style={{ marginBottom: 14 }}>
            <div className="panel-header telemetry-radar-header">
              <h3>Market Overview</h3>
              <span className="telemetry-live-badge">
                <span className="live-dot" aria-hidden="true" />
                LIVE
              </span>
            </div>
            <div className="panel-body">
              {marketLoading ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Loading market data…</p>
              ) : (
                <div className="telemetry-radar-grid">
                  {marketData?.assets?.slice(0, 8).map((asset) => (
                    <CryptoCard key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Latest Crypto News</h3>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {NEWS_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`cat-tab${activeTab === tab ? ' active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {newsLoading ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Syncing crypto feeds…</p>
              ) : filteredItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>No news found</h3>
                </div>
              ) : (
                <div className="news-grid">
                  {filteredItems.map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
