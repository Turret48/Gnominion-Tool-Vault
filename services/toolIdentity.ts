const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_eid',
]);

const isLikelyUrl = (input: string) => {
  if (!input) return false;
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
  if (trimmed.includes(' ') || trimmed.includes('@')) return false;
  return trimmed.includes('.');
};

export const normalizeTextAlias = (input: string) => {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
};

export const normalizeUrl = (input: string) => {
  const raw = input.trim();
  const withScheme = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
  const url = new URL(withScheme);

  url.hostname = url.hostname.toLowerCase();
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
  }

  if (url.port === '80' || url.port === '443') {
    url.port = '';
  }

  url.hash = '';

  if (url.pathname === '/') {
    url.pathname = '';
  } else if (url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  const params = new URLSearchParams(url.search);
  params.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
      params.delete(key);
    }
  });

  const sorted = new URLSearchParams();
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => entries.push([key, value]));
  entries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, value]) => sorted.append(key, value));

  const normalized = `${url.protocol}//${url.hostname}${url.pathname}${sorted.toString() ? `?${sorted}` : ''}`;
  return normalized;
};

export const getRootDomain = (hostname: string) => {
  let lower = hostname.toLowerCase();
  if (lower.startsWith('www.')) lower = lower.slice(4);
  if (lower.startsWith('app.')) lower = lower.slice(4);
  return lower;
};

export const looksLikeUrl = (input: string) => isLikelyUrl(input);
