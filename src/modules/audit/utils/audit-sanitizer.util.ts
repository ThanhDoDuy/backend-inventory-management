import { sanitize } from '../../../infrastructure/logger/sanitize.util';

export function sanitizeAuditRecord(
  data?: Record<string, unknown>,
): Record<string, unknown> {
  if (!data) {
    return {};
  }
  return (sanitize(data) ?? {}) as Record<string, unknown>;
}
