'use client';

import { useState } from 'react';
import { useResearchPapers } from '@/hooks/use-feeds';
import { ResearchCard } from '@/components/cards/research-card';
import { MODULE_CONFIGS } from '@/lib/module-configs';
import { useBriefing } from '@/components/providers/briefing-provider';

const PAPER_TABS = ['All', 'cs.AI', 'cs.LG', 'cs.CL', 'cs.CV'];

export default function ResearchPage() {
  const [activeTab, setActiveTab] = useState('All');
  const config = MODULE_CONFIGS.research;
  const { data, isLoading } = useResearchPapers();

  const filteredItems =
    data?.papers?.filter((paper) => activeTab === 'All' || paper.categories.includes(activeTab)) ?? [];

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
        <div className="category-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PAPER_TABS.map((tab) => (
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
      </div>

      <div className="content-grid">
        <div className="content-main">
          <div className="panel">
            <div className="panel-header">
              <h3>Latest Research Papers</h3>
              <span className="telemetry-live-badge">
                <span className="live-dot" aria-hidden="true" />
                arXiv
              </span>
            </div>
            <div className="panel-body">
              {isLoading ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Loading research papers…</p>
              ) : filteredItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>No papers found</h3>
                  <p>Try a different category filter.</p>
                </div>
              ) : (
                <div className="news-grid">
                  {filteredItems.map((paper) => (
                    <ResearchCard key={paper.id} paper={paper} />
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
