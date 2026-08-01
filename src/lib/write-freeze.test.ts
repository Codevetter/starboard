import { describe, expect, it } from 'vitest';

import { shouldFreezeWrite } from './write-freeze';

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
});
