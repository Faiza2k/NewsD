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
}

type WidgetPhase =
  | { status: 'loading' }
  | { status: 'need_https' }
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

  const fetchWeather = useCallback((lat: number, lon: number) => {
    setPhase({ status: 'loading' });
    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) {
          setPhase({ status: 'ready', weather: data as WeatherData });
        } else {
          setPhase({ status: 'need_permission', reason: 'unavailable' });
        }
      })
      .catch(() => setPhase({ status: 'need_permission', reason: 'unavailable' }));
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Browsers only allow geolocation on HTTPS or localhost.
    if (!window.isSecureContext) {
      setPhase({ status: 'need_https' });
      return;
    }

    if (!navigator.geolocation) {
      setPhase({ status: 'need_permission', reason: 'unavailable' });
      return;
    }

    setPhase({ status: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      (err) => setPhase({ status: 'need_permission', reason: geoErrorReason(err?.code) }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, [fetchWeather]);

  useEffect(() => {
    requestLocation();
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

  if (phase.status === 'need_https') {
    return (
      <div
        className="weather-widget weather-widget--prompt"
        id="weather-widget"
        aria-label="Local weather needs a secure connection"
      >
        <div className="weather-visual" aria-hidden="true">
          <div className="wx-loader" />
        </div>
        <div className="weather-data">
          <div className="weather-location">Local weather unavailable</div>
          <div className="weather-condition weather-prompt-text">
            Open this site with HTTPS so your browser can share location.
          </div>
        </div>
      </div>
    );
  }

  if (phase.status === 'need_permission') {
    const hint =
      phase.reason === 'denied'
        ? 'Location permission was blocked. Allow it for this site, then retry.'
        : 'Allow location access to see weather where you are.';

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
          <button type="button" className="weather-allow-btn" onClick={requestLocation}>
            Allow location
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
      <span className="weather-updated">LIVE</span>
    </div>
  );
}
