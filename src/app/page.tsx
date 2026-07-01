'use client';

import {
  useFeeds,
  useCryptoMarket,
  useGithubTrending,
  useHackerNews,
} from '@/hooks/use-feeds';
import { NewsCard } from '@/components/cards/news-card';
import { CryptoCard } from '@/components/cards/crypto-card';
import { GithubCard } from '@/components/cards/github-card';
import { TickerBar } from '@/components/ui/ticker-bar';
import { AISummaryPanel } from '@/components/ui/ai-summary-panel';

/* ── KPI Box ── */
function KpiBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card-terminal p-4 flex flex-col justify-between" style={{ minHeight: '90px' }}>
      <span className="label-mono mb-2">{label}</span>
      <span className="stat-number text-[32px] leading-none" style={{ color: 'var(--accent-cyan)' }}>
        {value}
      </span>
    </div>
  );
}

/* ── Section Header ── */
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[18px] font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      {subtitle && (
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   OVERVIEW PAGE (BLOOMBERG TERMINAL STYLE)
═══════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { data: aiData }       = useFeeds('ai', 6);
  const { data: cryptoMarket } = useCryptoMarket();
  const { data: githubData }   = useGithubTrending();
  const { data: hnData }       = useHackerNews();
  const { data: globalData }   = useFeeds(undefined, 100);

  // Compute stats
  const totalNews = globalData?.total || 0;
  const totalCrypto = cryptoMarket?.assets?.length || 0;
  const totalGithub = githubData?.repos?.length || 0;
  
  // High priority count (mock stat based on news score > 7)
  const highPriority = globalData?.items?.filter(item => item.significance >= 8).length || 0;

  return (
    <div className="-mt-2 pb-12 w-full">
      {/* 1. TOP TICKER BAR */}
      <TickerBar />

      <div className="w-full px-5 pt-6 max-w-[1400px] mx-auto">
        {/* 2. PAGE HEADER */}
        <div className="mb-5">
          <h1 className="text-[24px] font-bold leading-tight mb-0.5" style={{ color: 'var(--text-primary)' }}>
            Intelligence Overview
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Real-time monitoring · Markets · AI · Technology
          </p>
        </div>

        {/* 4 KPI STAT BOXES */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <KpiBox label="NEWS ITEMS" value={totalNews} />
          <KpiBox label="CRYPTO ASSETS" value={totalCrypto} />
          <KpiBox label="GITHUB REPOS" value={totalGithub} />
          <KpiBox label="HIGH PRIORITY" value={highPriority} />
        </div>

        {/* 3. AI BRIEF SECTION */}
        <div className="mb-6">
          <AISummaryPanel />
        </div>

        {/* 4. CORE MARKETS SECTION */}
        <div className="mb-6">
          <SectionHeader
            title="Core Markets"
            subtitle="Latest intelligence across Artificial Intelligence and Crypto Markets"
          />
          <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4">
            {/* AI Intelligence news cards (2 columns inside) */}
            <div className="2xl:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiData?.items?.slice(0, 6).map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            </div>

            {/* Crypto Assets Sidebar */}
            <div className="card-terminal flex flex-col overflow-hidden">
              <div className="p-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
                <span className="label-mono">Live Crypto Feed</span>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar">
                {cryptoMarket?.assets?.slice(0, 8).map((asset, i) => (
                  <CryptoCard key={asset.id} asset={asset} index={i} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 5. TECHNOLOGY & OPEN SOURCE SECTION */}
        <div className="mb-6">
          <SectionHeader
            title="Technology & Open Source"
            subtitle="Trending repositories on GitHub and top stories from Hacker News"
          />
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            {/* GitHub Trending */}
            <div className="space-y-3">
              {githubData?.repos?.slice(0, 6).map((repo) => (
                <GithubCard key={repo.id} repo={repo} />
              ))}
            </div>

            {/* Hacker News */}
            <div className="card-terminal overflow-hidden flex flex-col">
              <div className="p-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
                <span className="label-mono">Hacker News Top Stories</span>
              </div>
              <div className="flex-1">
                {hnData?.stories?.slice(0, 8).map((story, i) => (
                  <a
                    key={story.id}
                    href={story.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 border-b transition-colors hover:bg-[var(--bg-hover)]"
                    style={{
                      borderColor: 'var(--border-default)',
                      borderBottomWidth: i === 7 ? 0 : 1,
                    }}
                  >
                    <span
                      className="stat-number text-[16px] font-bold mt-0.5 w-8 text-right flex-shrink-0"
                      style={{ color: 'var(--accent-cyan)' }}
                    >
                      {story.score}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug mb-0.5" style={{ color: 'var(--text-primary)' }}>
                        {story.title}
                      </p>
                      <p className="label-mono lowercase" style={{ color: 'var(--text-muted)' }}>
                        {story.by} · {story.descendants} comments
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
