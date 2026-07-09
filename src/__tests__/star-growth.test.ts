import { describe, expect, it } from 'vitest';

import { calculateStarGrowth, rankGrowthRepos } from '@/lib/star-growth';

describe('calculateStarGrowth', () => {
  it('returns a collecting-history state for sparse snapshots', () => {
    const growth = calculateStarGrowth([
      { stargazersCount: 100, capturedAt: '2026-01-01T00:00:00Z' },
    ]);

    expect(growth.enoughHistory).toBe(false);
    expect(growth.starsGained).toBeNull();
  });

  it('calculates absolute, percent, and per-day growth', () => {
    const growth = calculateStarGrowth([
      { stargazersCount: 100, capturedAt: '2026-01-01T00:00:00Z' },
      { stargazersCount: 160, capturedAt: '2026-01-04T00:00:00Z' },
    ]);

    expect(growth.enoughHistory).toBe(true);
    expect(growth.starsGained).toBe(60);
    expect(growth.percentGrowth).toBeCloseTo(60);
    expect(growth.starsPerDay).toBeCloseTo(20);
  });

  it('sorts snapshots before calculating growth', () => {
    const growth = calculateStarGrowth([
      { stargazersCount: 130, capturedAt: '2026-01-03T00:00:00Z' },
      { stargazersCount: 100, capturedAt: '2026-01-01T00:00:00Z' },
    ]);

    expect(growth.starsGained).toBe(30);
  });
});

describe('rankGrowthRepos', () => {
  it('ranks by absolute stars gained and uses current stars as a tie-breaker', () => {
    const ranked = rankGrowthRepos([
      {
        repoId: 1,
        currentStars: 1000,
        growth: calculateStarGrowth([
          { stargazersCount: 900, capturedAt: '2026-01-01T00:00:00Z' },
          { stargazersCount: 1000, capturedAt: '2026-01-02T00:00:00Z' },
        ]),
      },
      {
        repoId: 2,
        currentStars: 2000,
        growth: calculateStarGrowth([
          { stargazersCount: 1900, capturedAt: '2026-01-01T00:00:00Z' },
          { stargazersCount: 2000, capturedAt: '2026-01-02T00:00:00Z' },
        ]),
      },
    ]);

    expect(ranked.map((repo) => repo.repoId)).toEqual([2, 1]);
  });
});
