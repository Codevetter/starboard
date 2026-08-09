import { describe, expect, it } from 'vitest';

import { DEFAULT_AUTH_DESTINATION, resolveInternalCallbackUrl } from '@/lib/auth-navigation';

describe('resolveInternalCallbackUrl', () => {
  it('sends generic sign-ins to Discover', () => {
    expect(resolveInternalCallbackUrl(undefined)).toBe('/discover');
    expect(resolveInternalCallbackUrl('https://example.com/projects')).toBe('/discover');
    expect(DEFAULT_AUTH_DESTINATION).toBe('/discover');
  });

  it.each(['/stars', '/projects', '/projects?repository=acme%2Fapp'])(
    'preserves the internal callback %s',
    (callbackUrl) => {
      expect(resolveInternalCallbackUrl(callbackUrl)).toBe(callbackUrl);
    }
  );

  it.each(['//example.com', '/\\example.com'])('rejects the unsafe callback %s', (callbackUrl) => {
    expect(resolveInternalCallbackUrl(callbackUrl)).toBe('/discover');
  });
});
