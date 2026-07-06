import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

import { getCached, setCache } from '@/lib/feeds/cache';

const CACHE_TTL = 15 * 60 * 1000;

function weatherThemeAndLabel(code: number, isDay: number): { theme: string; label: string } {
  const map: Record<number, { theme: string; label: string }> = {
    0: { theme: 'clear', label: 'Clear sky' },
    1: { theme: 'clear', label: 'Mainly clear' },
    2: { theme: 'cloudy', label: 'Partly cloudy' },
    3: { theme: 'cloudy', label: 'Overcast' },
    45: { theme: 'fog', label: 'Foggy' },
    48: { theme: 'fog', label: 'Depositing rime fog' },
    51: { theme: 'rain', label: 'Light drizzle' },
    53: { theme: 'rain', label: 'Drizzle' },
    55: { theme: 'rain', label: 'Dense drizzle' },
    61: { theme: 'rain', label: 'Slight rain' },
    63: { theme: 'rain', label: 'Moderate rain' },
    65: { theme: 'rain', label: 'Heavy rain' },
    71: { theme: 'snow', label: 'Snow fall' },
    73: { theme: 'snow', label: 'Snow fall' },
    75: { theme: 'snow', label: 'Heavy snow' },
    80: { theme: 'rain', label: 'Rain showers' },
    81: { theme: 'rain', label: 'Rain showers' },
    82: { theme: 'rain', label: 'Violent rain showers' },
    95: { theme: 'storm', label: 'Thunderstorm' },
    96: { theme: 'storm', label: 'Thunderstorm with hail' },
    99: { theme: 'storm', label: 'Thunderstorm with hail' },
  };
  const entry = map[code] ?? { theme: isDay ? 'cloudy' : 'clear', label: 'Variable' };
  if (!isDay && entry.theme === 'clear') entry.theme = 'clear-night';
  return entry;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const latArg = searchParams.get('lat');
  const lonArg = searchParams.get('lon');

  let lat: number;
  let lon: number;
  let locationHint = searchParams.get('city')?.trim() || '';

  if (latArg && lonArg) {
    lat = parseFloat(latArg);
    lon = parseFloat(lonArg);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
    }
  } else {
    // Default: approximate global HQ fallback (London)
    lat = 51.5074;
    lon = -0.1278;
    locationHint = locationHint || 'London, UK';
  }

  lat = Math.max(-90, Math.min(90, lat));
  lon = Math.max(-180, Math.min(180, lon));
  const cacheKey = `weather:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) return Response.json(cached);

  let locationName = locationHint || 'Your Location';

  if (!locationHint) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&addressdetails=1`;
      const geoRes = await fetch(nomUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'NewsDash/1.0 (weather widget)' },
      });
      if (geoRes.ok) {
        const geo = await geoRes.json();
        const addr = geo.address ?? {};
        const city =
          addr.city || addr.town || addr.village || addr.municipality || addr.county;
        const country = (addr.country_code as string | undefined)?.toUpperCase();
        if (city && country) locationName = `${city}, ${country}`;
        else if (city) locationName = city;
        else if (geo.display_name) locationName = String(geo.display_name).split(',')[0];
      }
    } catch {
      // keep fallback name
    }
  }

  try {
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
      '&timezone=auto';

    const wxRes = await fetch(forecastUrl, { headers: { Accept: 'application/json' } });
    if (!wxRes.ok) throw new Error(`Open-Meteo ${wxRes.status}`);

    const payload = await wxRes.json();
    const current = payload.current ?? {};
    const isDay = Number(current.is_day ?? 1);
    const code = Number(current.weather_code ?? 3);
    const { theme, label } = weatherThemeAndLabel(code, isDay);

    const result = {
      location: locationName,
      latitude: lat,
      longitude: lon,
      temperature: Math.round(Number(current.temperature_2m ?? 0)),
      feelsLike: Math.round(Number(current.apparent_temperature ?? 0)),
      humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
      windKmh: Math.round(Number(current.wind_speed_10m ?? 0)),
      weatherCode: code,
      condition: label,
      theme,
      isDay: Boolean(isDay),
      timezone: payload.timezone ?? 'UTC',
      updatedAt: current.time ?? new Date().toISOString(),
    };

    setCache(cacheKey, result, CACHE_TTL);
    return Response.json(result);
  } catch (e) {
    console.warn('[Weather API] failed:', e);
    return Response.json({ error: 'Weather data temporarily unavailable' }, { status: 502 });
  }
}
