'use client';

import type { CryptoAsset } from '@/types';

export function MarketPulseGrid({ assets }: { assets: CryptoAsset[] }) {
  const top = assets.slice(0, 4);
  if (top.length === 0) return null;

  return (
    <div className="telemetry-radar-grid">
      {top.map((asset) => {
        const isUp = (asset.price_change_percentage_24h || 0) >= 0;
        const decimals = asset.current_price < 10 ? 2 : 0;
        return (
          <div
            key={asset.id}
            className={`market-pulse-card ${isUp ? 'is-up' : 'is-down'}`}
          >
            <div className="telemetry-card-header">
              <span className="telemetry-card-label">{asset.symbol.toUpperCase()}</span>
              <span className={`pulse-dot ${isUp ? 'is-up' : 'is-down'}`} />
            </div>
            <div className="telemetry-price">
              ${asset.current_price.toLocaleString('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              })}
            </div>
            <div className={`stat-number text-[0.8rem] font-semibold ${isUp ? 'text-up' : 'text-down'}`}>
              {isUp ? '▲' : '▼'} {Math.abs(asset.price_change_percentage_24h || 0).toFixed(2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
