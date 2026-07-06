'use client';

import type { CryptoAsset } from '@/types';

const SYMBOL_ORDER = ['btc', 'eth', 'sol'];

function findAsset(assets: CryptoAsset[], symbol: string) {
  return assets.find((a) => a.symbol.toLowerCase() === symbol);
}

function TelemetryCard({
  name,
  symbol,
  asset,
}: {
  name: string;
  symbol: string;
  asset?: CryptoAsset;
}) {
  if (!asset) return null;

  const isUp = (asset.price_change_percentage_24h || 0) >= 0;
  const colorClass = isUp ? 'text-up' : 'text-down';
  const price = asset.current_price;
  const decimals = price < 10 ? (price < 2 ? 4 : 2) : 0;

  return (
    <div
      className={`market-pulse-card ${isUp ? 'is-up' : 'is-down'}`}
      data-symbol={symbol}
    >
      <div className="telemetry-card-header">
        <span className="telemetry-card-label">{name}</span>
        <span className={`pulse-dot ${isUp ? 'is-up' : 'is-down'}`} aria-hidden="true" />
      </div>
      <div className="telemetry-price">
        ${price.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </div>
      <div className={`telemetry-change ${colorClass}`}>
        {isUp ? '▲' : '▼'} {isUp ? '+' : ''}
        {(asset.price_change_percentage_24h || 0).toFixed(2)}%
      </div>
      <div className="telemetry-sparkline" aria-hidden="true" />
    </div>
  );
}

export function TelemetryRadarPanel({ assets }: { assets: CryptoAsset[] }) {
  if (assets.length === 0) return null;

  return (
    <div className="panel telemetry-radar-panel" style={{ marginBottom: 14 }}>
      <div className="panel-header telemetry-radar-header">
        <h3>Live Telemetry Radar</h3>
        <span className="telemetry-live-badge">
          <span className="live-dot" aria-hidden="true" />
          LIVE
        </span>
      </div>
      <div className="panel-body">
        <div className="telemetry-radar-grid">
          <TelemetryCard name="Bitcoin (BTC)" symbol="BTC" asset={findAsset(assets, 'btc')} />
          <TelemetryCard name="Ethereum (ETH)" symbol="ETH" asset={findAsset(assets, 'eth')} />
          <TelemetryCard name="Solana (SOL)" symbol="SOL" asset={findAsset(assets, 'sol')} />
          {assets
            .filter((a) => !SYMBOL_ORDER.includes(a.symbol.toLowerCase()))
            .slice(0, 2)
            .map((a) => (
              <TelemetryCard
                key={a.id}
                name={a.name}
                symbol={a.symbol.toUpperCase()}
                asset={a}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
