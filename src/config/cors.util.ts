import { APP } from '../shared/constants/app.constants';

/** Browser Origin never has a trailing slash; env may include one. */
export function normalizeCorsOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function parseCorsOrigins(raw?: string): string[] {
  if (!raw?.trim()) {
    return [...APP.cors.localOrigins];
  }

  const origins = raw
    .split(',')
    .map((origin) => normalizeCorsOrigin(origin))
    .filter(Boolean);

  return origins.length > 0 ? origins : [...APP.cors.localOrigins];
}

export function isValidCorsOrigin(origin: string): boolean {
  const normalized = normalizeCorsOrigin(origin);

  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }
    return (
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function validateCorsOriginsString(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const origins = trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    return 'CORS_ORIGIN must include at least one origin';
  }

  const invalid = origins.filter((origin) => !isValidCorsOrigin(origin));
  if (invalid.length > 0) {
    return `CORS_ORIGIN contains invalid origin(s): ${invalid.join(', ')}. Use full URLs like https://app.example.com/ or http://localhost:3001`;
  }

  return undefined;
}

export function isCorsOriginAllowed(
  requestOrigin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!requestOrigin) {
    return true;
  }

  const allowed = new Set(allowedOrigins.map(normalizeCorsOrigin));
  return allowed.has(normalizeCorsOrigin(requestOrigin));
}
