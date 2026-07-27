/**
 * Pure routing gates for live plugins (weather / fuel).
 * Kept outside route.ts so CI can lock production failure classes without HTTP.
 */

/** Roman-Urdu / English fillers that must never be treated as city names. */
export const WEATHER_NON_CITY = new Set([
  'weather',
  'forecast',
  'temperature',
  'humidity',
  'mosam',
  'mosaam',
  'mausam',
  'today',
  'now',
  'current',
  'please',
  'tell',
  'me',
  'about',
  'of',
  'in',
  'for',
  'the',
  'a',
  'an',
  'to',
  'know',
  'want',
  'need',
  'check',
  'see',
  'find',
  'out',
  'give',
  'show',
  'i',
  'is',
  'what',
  'whats',
  'how',
  'kya',
  'hai',
  'ne',
  'and',
  'aur',
  'or',
  'ka',
  'ki',
  'ke',
  'mein',
  'kyun',
  'why',
  'kab',
  'when',
  'ok',
  'okay',
  'more',
  'batao',
  'bataen',
  'it',
  'this',
  'that',
  'there',
  // "how's the weather?" → kaisa/kesa must not geocode to Kesa, PNG
  'kaisa',
  'kaisay',
  'kaise',
  'kaisi',
  'kesa',
  'kese',
  'kesi',
  'kesay',
  // Roman Urdu locatives: "zhob mai" = "in Zhob"
  'mai',
  'me',
  'par',
  'pe',
]);

export const CITY_ALIASES: Record<string, string> = {
  'fish hour': 'Peshawar',
  fishhour: 'Peshawar',
  'fish our': 'Peshawar',
  pishawar: 'Peshawar',
  peshawar: 'Peshawar',
  peshwar: 'Peshawar',
  peshawer: 'Peshawar',
  'islam abad': 'Islamabad',
  isloambad: 'Islamabad',
  'rawal pindi': 'Rawalpindi',
  lahore: 'Lahore',
  karachi: 'Karachi',
  zhob: 'Zhob',
  quetta: 'Quetta',
  kwetta: 'Quetta',
  islamabad: 'Islamabad',
};

export function stripWeatherFillers(raw: string): string {
  return String(raw || '')
    .replace(new RegExp(`\\b(${[...WEATHER_NON_CITY].join('|')})\\b`, 'gi'), ' ')
    .replace(/موسم|بتاؤ|بتاو|کیا|ہے|کیسا|کیسے|کیسی/g, ' ')
    .replace(/[?/!,.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCityQuery(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return CITY_ALIASES[key] || name.trim();
}

function lightClean(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split "karachi, zhob, peshawar and quetta" into separate city names. */
export function splitWeatherCities(raw: string): string[] {
  const cleaned = stripWeatherFillers(raw);
  if (!cleaned) return [];

  const parts = cleaned
    .split(/,|\band\b|\baur\b|&/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const cities: string[] = [];
  const seen = new Set<string>();
  for (const part of parts.length ? parts : [cleaned]) {
    const tokens = part.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.every((t) => t.length <= 12)) {
      for (const t of tokens) {
        const n = normalizeCityQuery(t);
        const key = n.toLowerCase();
        if (n.length >= 3 && !seen.has(key)) {
          seen.add(key);
          cities.push(n);
        }
      }
    } else {
      const n = normalizeCityQuery(part);
      const key = n.toLowerCase();
      if (n.length >= 2 && !seen.has(key)) {
        seen.add(key);
        cities.push(n);
      }
    }
  }
  return cities.slice(0, 6);
}

export function extractWeatherCitiesFromAsk(ask: string): string[] {
  return splitWeatherCities(lightClean(ask));
}

/** True when the bot just asked for a weather city and the user is filling that slot. */
export function awaitingWeatherCitySlot(args: {
  memoryIntent?: string;
  topicIntent?: string;
  lastBrief?: string;
  lastAnswer?: string;
}): boolean {
  const intent = args.memoryIntent || args.topicIntent || '';
  if (intent !== 'weather') return false;
  const hay = `${args.lastBrief || ''} ${args.lastAnswer || ''}`.toLowerCase();
  return /need city|which city|کس شہر|شہر کا نام|city should i check|reply with a city/.test(hay);
}

export function looksLikeCitySlotFill(q: string): boolean {
  const cleaned = stripWeatherFillers(q);
  if (cleaned.length < 3 || cleaned.length > 40) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return false;
  if (words.some((w) => WEATHER_NON_CITY.has(w.toLowerCase()))) return false;
  if (
    /\b(news|headline|price|bitcoin|btc|ethereum|gold|petrol|diesel|openai|iran|ukraine|war)\b/i.test(
      cleaned,
    )
  ) {
    return false;
  }
  return true;
}

/** True when user wants Pakistan pump fuel, not international crude barrels. */
export function wantsPakistanPumpFuel(q: string): boolean {
  const s = String(q || '');
  if (/\b(wti|brent|crude|barrel|opec|platts)\b/i.test(s)) return false;
  return (
    /\b(petrol|diesel|gasoline|pump|hsd|fuel)\b/i.test(s) || /پیٹرول|پٹرول|ڈیزل|ایندھن|پمپ/.test(s)
  );
}

/** Which pump products to show — never dump both unless asked. */
export function requestedPumpProducts(q: string): { petrol: boolean; diesel: boolean } {
  const s = String(q || '');
  const wantsPetrol =
    /\b(petrol|gasoline|motor\s*spirit)\b/i.test(s) || /پیٹرول|پٹرول/.test(s);
  const wantsDiesel = /\b(diesel|hsd)\b/i.test(s) || /ڈیزل/.test(s);
  if (wantsPetrol || wantsDiesel) return { petrol: wantsPetrol, diesel: wantsDiesel };
  if (/\b(fuel|pump)\b/i.test(s) || /ایندھن|پمپ/.test(s)) {
    return { petrol: true, diesel: true };
  }
  return { petrol: true, diesel: false };
}

/** Detect pump-price lines that must not leak into unrelated replies. */
export function containsPumpPriceLeak(text: string): boolean {
  return /(?:\*?\s*petrol\*?:|\*?\s*diesel\*?:|\/\s*litre|\/\s*لیٹر|pakistan\s+pump\s+price)/i.test(
    String(text || ''),
  );
}

/** Reject known geocode misfires for weather fillers. */
export function isSpuriousWeatherLocation(location: string): boolean {
  return /papua\s+new\s+guinea|\bkesa\b.*madang/i.test(String(location || ''));
}
