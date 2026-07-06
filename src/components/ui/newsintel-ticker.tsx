'use client';

import { useCryptoMarket } from '@/hooks/use-feeds';

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
      <div className="ticker-label">
        <span className="pulse-dot" />
        MARKETS
      </div>
      <div className="ticker-scroll" id="ticker-scroll">
        <div className="ticker-track">
          {doubled.map((asset, i) => {
            if (!asset) return null;
            const isUp = (asset.price_change_percentage_24h || 0) >= 0;
            const price = asset.current_price;
            const priceFormatted = `$${price.toLocaleString(undefined, {
              minimumFractionDigits: price < 10 ? 2 : 0,
              maximumFractionDigits: price < 10 ? 2 : 0,
            })}`;
            return (
              <div
                key={`${asset.id}-${i}`}
                className="ticker-item"
                title={`${asset.symbol} • Real-Time 24h Trajectory`}
              >
                <span className="ticker-item-name">{asset.symbol.toUpperCase()}</span>
                <span className="ticker-item-price">{priceFormatted}</span>
                <span className={`ticker-item-change ${isUp ? 'up' : 'down'}`}>
                  {isUp ? '▲' : '▼'} {isUp ? '+' : ''}
                  {(asset.price_change_percentage_24h || 0).toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
