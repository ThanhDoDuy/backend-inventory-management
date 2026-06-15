const SENSITIVE_KEYS = new Set([
  'password',
  'old_password',
  'new_password',
  'access_token',
  'refresh_token',
  'password_hash',
  'authorization',
]);

export function sanitize(data?: unknown): unknown {
  if (data === null || data === undefined) {
    return {};
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item));
  }

  if (typeof data !== 'object') {
    return data;
  }

  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([key, value]) => {
      if (SENSITIVE_KEYS.has(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, sanitize(value)];
    }),
  );
}
