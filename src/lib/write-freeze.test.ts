import { describe, expect, it } from 'vitest';

import { isWriteFreezeExempt, shouldFreezeWrite } from './write-freeze';

describe('write freeze', () => {
  it('rejects mutations only while explicitly enabled', () => {
    expect(shouldFreezeWrite('POST', 'true')).toBe(true);
    expect(shouldFreezeWrite('DELETE', 'false')).toBe(false);
    expect(shouldFreezeWrite('POST', undefined)).toBe(false);
  });

  it('keeps safe reads available during a cutover', () => {
    expect(shouldFreezeWrite('GET', 'true')).toBe(false);
    expect(shouldFreezeWrite('HEAD', 'true')).toBe(false);
    expect(shouldFreezeWrite('OPTIONS', 'true')).toBe(false);
  });

  it('never freezes NextAuth signup/sign-in routes', () => {
    expect(isWriteFreezeExempt('/api/auth')).toBe(true);
    expect(isWriteFreezeExempt('/api/auth/callback/github')).toBe(true);
    expect(isWriteFreezeExempt('/api/auth/signin/github')).toBe(true);
    expect(isWriteFreezeExempt('/api/stars/sync')).toBe(false);

    expect(shouldFreezeWrite('POST', 'true', '/api/auth/callback/github')).toBe(false);
    expect(shouldFreezeWrite('POST', 'true', '/api/stars/sync')).toBe(true);
  });
});
