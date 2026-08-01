import { describe, expect, it } from 'vitest';

import { chunkForD1, D1_MAX_BOUND_PARAMETERS } from './d1-limits';

describe('D1 query limits', () => {
  it('chunks candidate ids below the bound-parameter limit', () => {
    const chunks = chunkForD1(
      Array.from({ length: 200 }, (_, index) => index),
      1
    );
    expect(chunks.map((chunk) => chunk.length)).toEqual([99, 99, 2]);
    expect(Math.max(...chunks.map((chunk) => chunk.length + 1))).toBe(D1_MAX_BOUND_PARAMETERS);
  });

  it('rejects an impossible reservation', () => {
    expect(() => chunkForD1([1], 100)).toThrow('at least one');
  });
});
