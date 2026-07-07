'use client';

import { useCryptoMarket } from '@/hooks/use-feeds';
import { WeatherWidget } from '@/components/ui/weather-widget';

export function NewsIntelTicker() {
  const { data } = useCryptoMarket();
  const assets = data?.assets ?? [];

  const ordered = ['btc', 'eth', 'sol', 'bnb', 'xrp'];
  const items = ordered
    .map((sym) => assets.find((a) => a.symbol.toLowerCase() === sym))
    .filter(Boolean)
    .concat(assets.filter((a) => !ordered.includes(a.symbol.toLowerCase())).slice(0, 3));

  const doubled = [...items, ...items];

  return (
    <div className="market-ticker">
      <div className="ticker-left">
        <WeatherWidget />
      </div>
      <div className="ticker-scroll" id="ticker-scroll">
        <div className="ticker-track">
          {doubled.map((asset, i) => {
            if (!asset) return null;
            const isUp = (asset.price_change_percentage_24h || 0) >= 0;
            const price = asset.current_price;
            const decimals = price < 10 ? (price < 2 ? 4 : 2) : 0;
            return (
              <div
                key={`${asset.id}-${i}`}
                className={`market-pulse-card ticker-telemetry-card ${isUp ? 'is-up' : 'is-down'}`}
                title={`${asset.name} (${asset.symbol.toUpperCase()}) • 24h change`}
              >
                <div className="telemetry-card-header">
                  <span className="telemetry-card-label">{asset.symbol.toUpperCase()}</span>
                  <span className={`pulse-dot ${isUp ? 'is-up' : 'is-down'}`} aria-hidden="true" />
                </div>
                <div className="telemetry-price">
                  ${price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
                </div>
                <div className={`telemetry-change ${isUp ? 'text-up' : 'text-down'}`}>
                  {isUp ? '▲' : '▼'} {isUp ? '+' : ''}
                  {(asset.price_change_percentage_24h || 0).toFixed(2)}%
                </div>
                <div className="telemetry-sparkline" aria-hidden="true" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
