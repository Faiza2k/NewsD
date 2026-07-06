'use client';

import { useState } from 'react';
import { useGithubTrending, useFeeds } from '@/hooks/use-feeds';
import { GithubCard } from '@/components/cards/github-card';
import { NewsCard } from '@/components/cards/news-card';
import { MODULE_CONFIGS } from '@/lib/module-configs';
import { useBriefing } from '@/components/providers/briefing-provider';

const LANG_TABS = ['All', 'Python', 'TypeScript', 'Rust', 'Go'];

export default function GithubPage() {
  const [activeTab, setActiveTab] = useState('All');
  const config = MODULE_CONFIGS.github;
  const { data, isLoading } = useGithubTrending();
  const { data: newsData, isLoading: newsLoading } = useFeeds('github', 30);

  const filteredRepos =
    data?.repos?.filter((repo) => activeTab === 'All' || repo.language === activeTab) ?? [];
  const newsItems = newsData?.items ?? [];

  const { openBriefing } = useBriefing();

  return (
    <>
      <div className="module-header animate-fade-in">
        <div className="module-header-top">
          <div className="module-title-group">
            <div className={`module-icon ${config.iconClass}`}>{config.icon}</div>
            <div className="module-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2>{config.title}</h2>
                <span
                  className="live-indicator"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.72rem',
                    color: 'var(--accent-emerald)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    fontWeight: 600,
                  }}
                >
                  <span
                    className="live-dot"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: 'var(--accent-emerald)',
                      borderRadius: '50%',
                      boxShadow: '0 0 8px var(--accent-emerald)',
                    }}
                  />
                  Live · auto-refreshing
                </span>
              </div>
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
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-header">
              <div>
                <h3>Trending New Repositories</h3>
                <span className="hot-trends-subtitle">Fast-rising AI/ML projects created in the last 90 days</span>
              </div>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {LANG_TABS.map((tab) => (
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
              {isLoading ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Loading trending repositories…</p>
              ) : filteredRepos.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>No repositories found</h3>
                  <p>Try a different language filter.</p>
                </div>
              ) : (
                <div className="news-grid">
                  {filteredRepos.map((repo) => (
                    <GithubCard key={repo.id} repo={repo} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h3>Latest from the Community</h3>
                <span className="hot-trends-subtitle">GitHub Blog, Hacker News, DEV, Reddit & more</span>
              </div>
            </div>
            <div className="panel-body">
              {newsLoading ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Syncing community feeds…</p>
              ) : newsItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>No community news found</h3>
                </div>
              ) : (
                <div className="news-grid">
                  {newsItems.map((item) => (
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
