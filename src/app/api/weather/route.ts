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

function isPublicIp(ip: string): boolean {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return false;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return false;
  return true;
}

/** Visitor IP from Coolify / Traefik / proxy headers (not the server's own IP). */
function clientIp(request: NextRequest): string | null {
  const candidates = [
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-real-ip'),
    request.headers.get('x-forwarded-for')?.split(',')[0],
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0],
  ];
  for (const raw of candidates) {
    const ip = String(raw || '')
      .trim()
      .replace(/^::ffff:/i, '');
    if (ip && isPublicIp(ip)) return ip;
  }
  return null;
}

async function coordsFromClientIp(
  request: NextRequest,
): Promise<{ lat: number; lon: number; locationHint: string } | null> {
  const ip = clientIp(request);
  if (!ip) return null;

  const cacheKey = `weather:ipgeo:${ip}`;
  const cached = getCached<{ lat: number; lon: number; locationHint: string }>(cacheKey);
  if (cached) return cached;

  try {
    // Free IP geolocation (server-side). Uses the visitor IP from proxy headers.
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,lat,lon,city,regionName,countryCode`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      lat?: number;
      lon?: number;
      city?: string;
      regionName?: string;
      countryCode?: string;
    };
    if (data.status !== 'success' || typeof data.lat !== 'number' || typeof data.lon !== 'number') {
      return null;
    }
    const city = data.city || data.regionName || 'Your area';
    const cc = data.countryCode ? `, ${data.countryCode}` : '';
    const resolved = {
      lat: data.lat,
      lon: data.lon,
      locationHint: `${city}${cc}`,
    };
    setCache(cacheKey, resolved, CACHE_TTL);
    return resolved;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const latArg = searchParams.get('lat');
  const lonArg = searchParams.get('lon');

  let lat: number;
  let lon: number;
  let locationHint = searchParams.get('city')?.trim() || '';
  let source: 'gps' | 'ip' = 'gps';

  if (latArg && lonArg) {
    lat = parseFloat(latArg);
    lon = parseFloat(lonArg);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
    }
  } else {
    // HTTP / blocked GPS: approximate from visitor IP (Coolify proxy headers).
    const fromIp = await coordsFromClientIp(request);
    if (!fromIp) {
      return Response.json(
        {
          error:
            'Could not detect your location. Allow browser location on HTTPS, or check proxy IP headers.',
        },
        { status: 400 },
      );
    }
    lat = fromIp.lat;
    lon = fromIp.lon;
    locationHint = locationHint || fromIp.locationHint;
    source = 'ip';
  }

  lat = Math.max(-90, Math.min(90, lat));
  lon = Math.max(-180, Math.min(180, lon));
  const cacheKey = `weather:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) return Response.json({ ...cached, source });

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
      source,
    };

    setCache(cacheKey, result, CACHE_TTL);
    return Response.json(result);
  } catch (e) {
    console.warn('[Weather API] failed:', e);
    return Response.json({ error: 'Weather data temporarily unavailable' }, { status: 502 });
  }
}
