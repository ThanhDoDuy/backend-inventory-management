import { sanitizeAuditRecord } from './audit-sanitizer.util';
import { sanitize } from '../../../infrastructure/logger/sanitize.util';

describe('audit-sanitizer.util', () => {
  it('redacts sensitive keys in audit payloads', () => {
    const result = sanitizeAuditRecord({
      email: 'user@example.com',
      password: 'secret123',
      access_token: 'jwt-token',
      nested: { refresh_token: 'refresh' },
    });

    expect(result.email).toBe('user@example.com');
    expect(result.password).toBe('[REDACTED]');
    expect(result.access_token).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).refresh_token).toBe(
      '[REDACTED]',
    );
  });

  it('returns empty object for undefined input', () => {
    expect(sanitizeAuditRecord(undefined)).toEqual({});
  });
});

describe('sanitize.util', () => {
  it('redacts password_hash', () => {
    const result = sanitize({ password_hash: 'hash' }) as Record<string, unknown>;
    expect(result.password_hash).toBe('[REDACTED]');
  });
});
