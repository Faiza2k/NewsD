'use client';

import { CryptoAsset } from '@/types';

export function CryptoCard({ asset }: { asset: CryptoAsset; index?: number }) {
  const isUp = (asset.price_change_percentage_24h || 0) >= 0;
  const colorClass = isUp ? 'text-up' : 'text-down';
  const decimals = asset.current_price < 10 ? 2 : 0;

  return (
    <div className={`market-pulse-card ${isUp ? 'is-up' : 'is-down'}`}>
      <div className="telemetry-card-header">
        <span className="telemetry-card-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.image} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
          {asset.name}
        </span>
        <span className={`pulse-dot ${isUp ? 'is-up' : 'is-down'}`} />
      </div>
      <div className="telemetry-price">
        ${asset.current_price.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </div>
      <div className={`telemetry-change ${colorClass}`}>
        {isUp ? '▲' : '▼'} {isUp ? '+' : ''}
        {(asset.price_change_percentage_24h || 0).toFixed(2)}%
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
        MCap ${(asset.market_cap / 1e9).toFixed(1)}B
      </div>
    </div>
  );
}
