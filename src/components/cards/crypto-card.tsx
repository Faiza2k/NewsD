'use client';

import { CryptoAsset } from '@/types';

export function CryptoCard({ asset, index }: { asset: CryptoAsset; index: number }) {
  const isPositive = (asset.price_change_percentage_24h || 0) >= 0;
  
  return (
    <div
      className="flex items-center gap-3 p-3 transition-colors hover:bg-[var(--bg-hover)] border-b"
      style={{
        borderColor: 'var(--border-default)',
        background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
      }}
    >
      <span className="label-mono w-4 text-center">{index + 1}</span>
      
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.image} alt={asset.name} className="w-5 h-5 rounded-full" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
            {asset.name}
          </span>
          <span className="label-mono">{asset.symbol}</span>
        </div>
        <div className="text-[12px] text-[var(--text-muted)]">
          MCap: ${(asset.market_cap / 1e9).toFixed(1)}B
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="stat-number text-[14px] text-[var(--text-primary)]">
          ${asset.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="stat-number text-[12px]" style={{ color: isPositive ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {isPositive ? '+' : ''}{(asset.price_change_percentage_24h || 0).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}
