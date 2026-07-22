'use client';

import { useCallback, useEffect, useState } from 'react';

interface WeatherData {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windKmh: number;
  condition: string;
  theme: string;
  source?: 'gps' | 'ip';
}

type WidgetPhase =
  | { status: 'loading' }
  | { status: 'need_permission'; reason: 'denied' | 'unavailable' | 'timeout' | 'unknown' }
  | { status: 'ready'; weather: WeatherData };

function geoErrorReason(code?: number): 'denied' | 'unavailable' | 'timeout' | 'unknown' {
  if (code === 1) return 'denied';
  if (code === 2) return 'unavailable';
  if (code === 3) return 'timeout';
  return 'unknown';
}

export function WeatherWidget() {
  const [phase, setPhase] = useState<WidgetPhase>({ status: 'loading' });

  const fetchByCoords = useCallback((lat: number, lon: number) => {
    setPhase({ status: 'loading' });
    return fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) {
          setPhase({ status: 'ready', weather: data as WeatherData });
          return true;
        }
        return false;
      })
      .catch(() => false);
  }, []);

  /** Approximate weather from visitor IP — works on HTTP Coolify without browser GPS. */
  const fetchByIp = useCallback(() => {
    setPhase({ status: 'loading' });
    return fetch('/api/weather')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) {
          setPhase({ status: 'ready', weather: data as WeatherData });
          return true;
        }
        return false;
      })
      .catch(() => false);
  }, []);

  const requestLocation = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // On plain HTTP (Coolify sslip.io), browsers block GPS — use IP approx instead.
    if (!window.isSecureContext) {
      const ok = await fetchByIp();
      if (!ok) setPhase({ status: 'need_permission', reason: 'unavailable' });
      return;
    }

    if (!navigator.geolocation) {
      const ok = await fetchByIp();
      if (!ok) setPhase({ status: 'need_permission', reason: 'unavailable' });
      return;
    }

    setPhase({ status: 'loading' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ok = await fetchByCoords(pos.coords.latitude, pos.coords.longitude);
        if (!ok) await fetchByIp();
      },
      async (err) => {
        const ok = await fetchByIp();
        if (!ok) setPhase({ status: 'need_permission', reason: geoErrorReason(err?.code) });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, [fetchByCoords, fetchByIp]);

  useEffect(() => {
    void requestLocation();
  }, [requestLocation]);

  if (phase.status === 'loading') {
    return (
      <div className="weather-widget weather-widget--loading" id="weather-widget" aria-label="Loading weather">
        <div className="weather-visual" aria-hidden="true">
          <div className="wx-loader" />
        </div>
        <div className="weather-data">
          <div className="weather-location">Detecting your location…</div>
        </div>
      </div>
    );
  }

  if (phase.status === 'need_permission') {
    const hint =
      phase.reason === 'denied'
        ? 'Location permission was blocked. Allow it, or retry IP-based weather.'
        : 'Could not detect your location. Retry to load local weather.';

    return (
      <div
        className="weather-widget weather-widget--prompt"
        id="weather-widget"
        aria-label="Allow location for local weather"
      >
        <div className="weather-visual" aria-hidden="true">
          <div className="wx-loader" />
        </div>
        <div className="weather-data">
          <div className="weather-location">Your location</div>
          <div className="weather-condition weather-prompt-text">{hint}</div>
          <button type="button" className="weather-allow-btn" onClick={() => void requestLocation()}>
            Retry weather
          </button>
        </div>
      </div>
    );
  }

  const weather = phase.weather;
  const theme = weather.theme ?? 'cloudy';
  const temp = weather.temperature ?? 22;
  const feels = weather.feelsLike ?? temp;
  const loc = weather.location ?? 'Your Location';
  const cond = weather.condition ?? 'Partly Cloudy';

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
            Humidity <span>{weather.humidity ?? '—'}%</span>
          </span>
          <span>
            Wind <span>{weather.windKmh ?? '—'}</span> km/h
          </span>
        </div>
      </div>
      <span className="weather-updated">{weather.source === 'ip' ? 'NEAR YOU' : 'LIVE'}</span>
    </div>
  );
}
