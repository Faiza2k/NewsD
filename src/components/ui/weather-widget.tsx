'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

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
  | { status: 'ask_permission' }
  | { status: 'ask_city'; message: string }
  | { status: 'ready'; weather: WeatherData };

export function WeatherWidget() {
  const [phase, setPhase] = useState<WidgetPhase>({ status: 'ask_permission' });
  const [cityInput, setCityInput] = useState('');

  const loadWeather = useCallback(async (params: { lat?: number; lon?: number; city?: string }) => {
    setPhase({ status: 'loading' });
    const qs = new URLSearchParams();
    if (params.lat != null && params.lon != null) {
      qs.set('lat', String(params.lat));
      qs.set('lon', String(params.lon));
    }
    if (params.city?.trim()) qs.set('city', params.city.trim());

    try {
      const res = await fetch(`/api/weather?${qs.toString()}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data && !data.error) {
        setPhase({ status: 'ready', weather: data as WeatherData });
        return true;
      }
      setPhase({
        status: 'ask_city',
        message: data?.error || 'Could not load weather for that location. Try another city.',
      });
      return false;
    } catch {
      setPhase({
        status: 'ask_city',
        message: 'Could not load weather. Enter your city to continue.',
      });
      return false;
    }
  }, []);

  const askBrowserPermission = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (!navigator.geolocation) {
      setPhase({
        status: 'ask_city',
        message: 'This browser cannot share GPS. Enter your city for local weather.',
      });
      return;
    }

    setPhase({ status: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void loadWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        // Permission denied / blocked / unavailable — ask the user for their city.
        setPhase({
          status: 'ask_city',
          message: 'Location permission was not granted. Type your city to see local weather.',
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [loadWeather]);

  // On first visit, immediately request the browser location permission prompt.
  useEffect(() => {
    askBrowserPermission();
  }, [askBrowserPermission]);

  const onCitySubmit = (e: FormEvent) => {
    e.preventDefault();
    const city = cityInput.trim();
    if (city.length < 2) return;
    void loadWeather({ city });
  };

  if (phase.status === 'loading') {
    return (
      <div className="weather-widget weather-widget--loading" id="weather-widget" aria-label="Loading weather">
        <div className="weather-visual" aria-hidden="true">
          <div className="wx-loader" />
        </div>
        <div className="weather-data">
          <div className="weather-location">Waiting for location…</div>
        </div>
      </div>
    );
  }

  if (phase.status === 'ask_permission') {
    return (
      <div
        className="weather-widget weather-widget--prompt"
        id="weather-widget"
        aria-label="Allow location for weather"
      >
        <div className="weather-visual" aria-hidden="true">
          <div className="wx-loader" />
        </div>
        <div className="weather-data">
          <div className="weather-location">Location needed</div>
          <div className="weather-condition weather-prompt-text">
            Allow location access to show weather where you are.
          </div>
          <button type="button" className="weather-allow-btn" onClick={askBrowserPermission}>
            Allow location
          </button>
        </div>
      </div>
    );
  }

  if (phase.status === 'ask_city') {
    return (
      <div
        className="weather-widget weather-widget--prompt"
        id="weather-widget"
        aria-label="Enter your city for weather"
      >
        <div className="weather-visual" aria-hidden="true">
          <div className="wx-loader" />
        </div>
        <div className="weather-data">
          <div className="weather-location">Your city</div>
          <div className="weather-condition weather-prompt-text">{phase.message}</div>
          <form className="weather-city-form" onSubmit={onCitySubmit}>
            <input
              className="weather-city-input"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Zhob, Peshawar"
              aria-label="City name"
              autoComplete="address-level2"
            />
            <button type="submit" className="weather-allow-btn">
              Show weather
            </button>
          </form>
          <button type="button" className="weather-allow-btn weather-allow-btn--ghost" onClick={askBrowserPermission}>
            Allow location instead
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
