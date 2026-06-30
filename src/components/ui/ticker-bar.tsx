'use client';

import { useCryptoMarket } from '@/hooks/use-feeds';

export function TickerBar() {
  const { data } = useCryptoMarket();
  const assets = data?.assets?.slice(0, 10) || [];

  if (assets.length === 0) return null;

  // Duplicate items for seamless infinite scroll
  const items = [...assets, ...assets];

  return (
    <div
      className="flex items-center overflow-hidden border-b relative w-full"
      style={{
        height: 'var(--ticker-height)',
        borderColor: 'var(--border-default)',
        background:  'var(--bg-card)',
      }}
    >
      <div className="flex items-center animate-ticker whitespace-nowrap h-full">
        {items.map((asset, i) => {
          const isPositive = (asset.price_change_percentage_24h || 0) >= 0;
          return (
            <div key={`${asset.id}-${i}`} className="flex items-center h-full">
              <div className="flex items-center gap-2 px-4 h-full">
                <div
                  className="w-3.5 h-3.5 rounded-full bg-cover flex-shrink-0"
                  style={{ backgroundImage: `url(${asset.image})` }}
                />
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
                  {asset.symbol}
                </span>
                <span className="stat-number text-[11px]" style={{ color: 'var(--text-body)' }}>
                  ${asset.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className="stat-number text-[11px] font-bold"
                  style={{ color: isPositive ? 'var(--accent-green)' : 'var(--accent-red)' }}
                >
                  {isPositive ? '+' : ''}{(asset.price_change_percentage_24h || 0).toFixed(2)}%
                </span>
              </div>
              <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
