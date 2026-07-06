'use client';

import { useEffect, useState } from 'react';

interface WeatherData {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windKmh: number;
  condition: string;
  theme: string;
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = (lat?: number, lon?: number) => {
      const params = lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : '';
      fetch(`/api/weather${params}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && !data.error) setWeather(data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(pos.coords.latitude, pos.coords.longitude),
        () => load(),
        { timeout: 8000, maximumAge: 600000 }
      );
    } else {
      load();
    }
  }, []);

  if (loading) {
    return (
      <div className="weather-widget weather-widget--loading" id="weather-widget" aria-label="Loading weather">
        <div className="weather-visual" aria-hidden="true">
          <div className="wx-loader" />
        </div>
        <div className="weather-data">
          <div className="weather-location">Syncing weather…</div>
        </div>
      </div>
    );
  }

  const theme = weather?.theme ?? 'cloudy';
  const temp = weather?.temperature ?? 22;
  const feels = weather?.feelsLike ?? temp;
  const loc = weather?.location ?? 'Your Location';
  const cond = weather?.condition ?? 'Partly Cloudy';

  return (
    <div
      className={`weather-widget weather--${theme}`}
      id="weather-widget"
      aria-label={`Current weather in ${loc}: ${temp} degrees, ${cond}`}
    >
      <div className="weather-visual" aria-hidden="true">
        <div className="wx-sun" />
        <div className="wx-moon" />
        <div className="wx-cloud wx-cloud--a" />
        <div className="wx-cloud wx-cloud--b" />
        <div className="wx-rain">
          <span /><span /><span /><span /><span />
        </div>
        <div className="wx-snow">
          <i /><i /><i /><i /><i />
        </div>
        <div className="wx-fog" />
        <div className="wx-flash" />
      </div>
      <div className="weather-data">
        <div className="weather-location">{loc}</div>
        <div className="weather-temp-row">
          <span className="weather-temp">{temp}°</span>
          <span className="weather-condition">{cond}</span>
        </div>
        <div className="weather-meta">
          <span>
            Feels <span>{feels}°</span>
          </span>
          <span>
            Humidity <span>{weather?.humidity ?? '—'}%</span>
          </span>
          <span>
            Wind <span>{weather?.windKmh ?? '—'}</span> km/h
          </span>
        </div>
      </div>
      <span className="weather-updated">LIVE</span>
    </div>
  );
}
