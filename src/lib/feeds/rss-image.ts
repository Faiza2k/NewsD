/**
 * Pull a usable article image URL from a parsed RSS/Atom item.
 * Tries enclosure → media → itunes → first <img> in HTML content.
 */
export function extractRssImageUrl(raw: Record<string, unknown>): string | undefined {
  const candidates: string[] = [];

  const enclosure = raw.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url) {
    const okType = !enclosure.type || /^image\//i.test(enclosure.type);
    const okExt = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(enclosure.url);
    if (okType || okExt) candidates.push(enclosure.url);
  }

  pushMediaUrl(candidates, raw.mediaThumbnail ?? raw['media:thumbnail']);
  pushMediaUrl(candidates, raw.mediaContent ?? raw['media:content']);
  pushMediaUrl(candidates, raw.itunesImage ?? raw['itunes:image']);

  if (typeof raw.image === 'string') candidates.push(raw.image);
  else if (raw.image && typeof raw.image === 'object') {
    const img = raw.image as { url?: string; href?: string };
    if (img.url) candidates.push(img.url);
    else if (img.href) candidates.push(img.href);
  }

  const html = [
    raw.content,
    raw['content:encoded'],
    raw.contentEncoded,
    raw.description,
    raw.summary,
  ]
    .filter((v) => typeof v === 'string' && /<img\b/i.test(v))
    .join('\n');
  if (html) {
    const re = /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      candidates.push(m[1]);
    }
  }

  for (const c of candidates) {
    const url = normalizeImageUrl(c);
    if (url) return url;
  }
  return undefined;
}

function pushMediaUrl(out: string[], value: unknown): void {
  if (!value) return;
  const list = Array.isArray(value) ? value : [value];
  for (const entry of list) {
    if (typeof entry === 'string') {
      out.push(entry);
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const attrs = (obj.$ ?? obj) as Record<string, unknown>;
    const url =
      (typeof attrs.url === 'string' && attrs.url) ||
      (typeof attrs.href === 'string' && attrs.href) ||
      (typeof obj.url === 'string' && obj.url) ||
      (typeof obj.href === 'string' && obj.href);
    if (url) out.push(url);
  }
}

function normalizeImageUrl(raw: string): string | undefined {
  const s = String(raw || '')
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/&quot;/gi, '')
    .replace(/\s+/g, '');
  if (!s || s.startsWith('data:')) return undefined;
  if (s.startsWith('//')) return `https:${s}`;
  if (!/^https?:\/\//i.test(s)) return undefined;
  // Skip tracking pixels / tiny icons
  if (/1x1|pixel|spacer|blank\.|favicon|logo[-_]?small/i.test(s)) return undefined;
  return s;
}
