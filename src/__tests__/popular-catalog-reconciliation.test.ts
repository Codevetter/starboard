import { describe, expect, it } from 'vitest';

import {
  enumeratePopularCatalog,
  planCatalogReconciliation,
  type CatalogRepoIdentity,
  type CatalogSearch,
} from '@/lib/popular-catalog-reconciliation';

interface FakeRepo extends CatalogRepoIdentity {
  createdAt: string;
}

function fakeSearch(repos: FakeRepo[], options: { incompleteQuery?: string } = {}): CatalogSearch {
  return async (query) => {
    const range = /created:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/.exec(query);
    const matches = range
      ? repos.filter((repo) => repo.createdAt >= range[1]! && repo.createdAt <= range[2]!)
      : repos;
    return {
      totalCount: matches.length,
      incomplete: options.incompleteQuery === query,
      repos: matches.slice(0, 100),
    };
  };
}

describe('enumeratePopularCatalog', () => {
  it('splits immutable creation-date ranges until every repository fits one response', async () => {
    const repos: FakeRepo[] = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      fullName: `owner/repo-${index + 1}`,
      createdAt: index < 50 ? '2025-01-01' : '2025-01-03',
    }));

    const result = await enumeratePopularCatalog(fakeSearch(repos), {
      minStars: 5000,
      minExpectedRepos: 1,
      startDate: '2025-01-01',
      endDate: '2025-01-03',
    });

    expect(result.sourceCount).toBe(101);
    expect(result.repos.size).toBe(101);
    expect(result.leafPartitions).toBeGreaterThan(1);
  });

  it('fails before reconciliation when GitHub marks a partition incomplete', async () => {
    const query = 'stars:>=5000 created:2025-01-01..2025-01-01';
    await expect(
      enumeratePopularCatalog(
        fakeSearch([{ id: 1, fullName: 'owner/repo', createdAt: '2025-01-01' }], {
          incompleteQuery: query,
        }),
        {
          minStars: 5000,
          minExpectedRepos: 1,
          startDate: '2025-01-01',
          endDate: '2025-01-01',
        }
      )
    ).rejects.toThrow('incomplete catalog evidence');
  });

  it('fails when the root source count changes during enumeration', async () => {
    let rootCalls = 0;
    const search: CatalogSearch = async (query) => {
      if (!query.includes('created:')) {
        rootCalls += 1;
        return {
          totalCount: rootCalls === 1 ? 1 : 2,
          incomplete: false,
          repos: [{ id: 1, fullName: 'owner/repo' }],
        };
      }
      return {
        totalCount: 1,
        incomplete: false,
        repos: [{ id: 1, fullName: 'owner/repo' }],
      };
    };

    await expect(
      enumeratePopularCatalog(search, {
        minStars: 5000,
        minExpectedRepos: 1,
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      })
    ).rejects.toThrow('source count changed');
  });

  it('fails when a supposedly complete leaf is truncated', async () => {
    const search: CatalogSearch = async (query) => ({
      totalCount: 1,
      incomplete: false,
      repos: query.includes('created:') ? [] : [{ id: 1, fullName: 'owner/repo' }],
    });

    await expect(
      enumeratePopularCatalog(search, {
        minStars: 5000,
        minExpectedRepos: 1,
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      })
    ).rejects.toThrow('returned 0/1 repositories');
  });

  it('fails when GitHub repeats an identity in the complete source set', async () => {
    const search: CatalogSearch = async () => ({
      totalCount: 2,
      incomplete: false,
      repos: [
        { id: 1, fullName: 'owner/repo' },
        { id: 1, fullName: 'owner/repo' },
      ],
    });

    await expect(
      enumeratePopularCatalog(search, {
        minStars: 5000,
        minExpectedRepos: 1,
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      })
    ).rejects.toThrow('duplicate repository ID 1');
  });

  it('fails when one creation day exceeds a single response', async () => {
    const repos: FakeRepo[] = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      fullName: `owner/repo-${index + 1}`,
      createdAt: '2025-01-01',
    }));

    await expect(
      enumeratePopularCatalog(fakeSearch(repos), {
        minStars: 5000,
        minExpectedRepos: 1,
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      })
    ).rejects.toThrow('one-response enumeration cannot prove completeness');
  });
});

describe('planCatalogReconciliation', () => {
  const source = new Map<number, CatalogRepoIdentity>([
    [1, { id: 1, fullName: 'owner/one' }],
    [2, { id: 2, fullName: 'owner/two' }],
  ]);

  it('returns only source IDs absent from D1 and counts stored-only IDs', () => {
    const plan = planCatalogReconciliation(source, new Set([1, 3]), 1);
    expect(plan.additions).toEqual([{ id: 2, fullName: 'owner/two' }]);
    expect(plan.storedOnlyCount).toBe(1);
  });

  it('rejects an unsafe delta before writes can start', () => {
    expect(() => planCatalogReconciliation(source, new Set(), 1)).toThrow(
      'Catalog additions 2 exceed safety bound 1; no writes performed'
    );
  });
});
