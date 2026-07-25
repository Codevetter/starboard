import { describe, expect, it } from 'vitest';

import { isRetryableDbError } from '@/lib/db-retry';

describe('isRetryableDbError', () => {
  it('retries transient libSQL server errors', () => {
    expect(isRetryableDbError({ code: 'SERVER_ERROR', message: 'HTTP status 400' })).toBe(true);
  });

  it('retries connection timeouts from the fetch cause', () => {
    expect(isRetryableDbError({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })).toBe(true);
  });

  it('does not retry SQL errors', () => {
    expect(isRetryableDbError({ code: 'SQLITE_ERROR', message: 'no such table' })).toBe(false);
  });

  it('does not retry authentication errors', () => {
    expect(isRetryableDbError({ code: 'AUTH_FAILED', message: 'invalid auth token' })).toBe(false);
  });
});
