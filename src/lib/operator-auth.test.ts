import { describe, expect, it } from 'vitest';

import { hasValidOperatorToken } from './operator-auth';

describe('operator auth', () => {
  it('accepts the configured bearer token', async () => {
    await expect(hasValidOperatorToken('Bearer expected-token', 'expected-token')).resolves.toBe(
      true
    );
  });

  it('fails closed for missing or malformed credentials', async () => {
    await expect(hasValidOperatorToken(null, 'expected-token')).resolves.toBe(false);
    await expect(hasValidOperatorToken('Basic expected-token', 'expected-token')).resolves.toBe(
      false
    );
    await expect(hasValidOperatorToken('Bearer expected-token', undefined)).resolves.toBe(false);
  });

  it('rejects a different bearer token', async () => {
    await expect(hasValidOperatorToken('Bearer other-token', 'expected-token')).resolves.toBe(
      false
    );
  });
});
