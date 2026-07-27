/** Production public origin for Coolify (not Vercel). Override with PUBLIC_APP_URL. */
export const DEFAULT_PUBLIC_APP_URL =
  'http://uln4n0vf3xlwibas8o3iowno.146.59.93.94.sslip.io';

/** Canonical public app URL (source links, Discord hints, branded redirects). */
export function getPublicAppUrl(): string {
  const fromEnv = process.env.PUBLIC_APP_URL?.trim() || process.env.COOLIFY_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return DEFAULT_PUBLIC_APP_URL;
}
