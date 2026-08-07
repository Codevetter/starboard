import { describe, expect, it } from 'vitest';

import {
  formatCatalogDate,
  groupCatalogChangesByDate,
  type CatalogChangeEntry,
} from '@/lib/catalog-updates';

const sample = (overrides: Partial<CatalogChangeEntry> = {}): CatalogChangeEntry => ({
  date: '2026-08-01',
  id: 1,
  fullName: 'owner/repo',
  name: 'repo',
  description: null,
  language: 'TypeScript',
  stargazersCount: 9000,
  ownerLogin: 'owner',
  ownerAvatar: '',
  htmlUrl: 'https://github.com/owner/repo',
  ...overrides,
});

describe('catalog-updates helpers', () => {
  it('groups changes by date preserving order of first appearance', () => {
    const groups = groupCatalogChangesByDate([
      sample({ id: 1, date: '2026-08-02', fullName: 'a/one' }),
      sample({ id: 2, date: '2026-08-02', fullName: 'a/two' }),
      sample({ id: 3, date: '2026-08-01', fullName: 'b/three' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-08-02', '2026-08-01']);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].entries[0].fullName).toBe('b/three');
  });

  it('formats UTC calendar dates stably', () => {
    expect(formatCatalogDate('2026-08-01')).toMatch(/2026/);
  });
});
