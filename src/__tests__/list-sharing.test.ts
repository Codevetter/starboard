import { describe, expect, it } from 'vitest';

import { generateUniqueListSlug, slugifyListName } from '@/lib/list-sharing';

describe('list sharing', () => {
  it('creates readable slugs from list names', () => {
    expect(slugifyListName('AI Tooling / Agents')).toBe('ai-tooling-agents');
    expect(slugifyListName('!!!')).toBe('list');
  });

  it('skips colliding share slugs', async () => {
    const existing = new Set(['ai-tools-dead']);
    const suffixes = ['dead', 'beef'];

    const slug = await generateUniqueListSlug(
      'AI Tools',
      async (candidate) => existing.has(candidate),
      () => suffixes.shift() ?? 'cafe'
    );

    expect(slug).toBe('ai-tools-beef');
  });
});
