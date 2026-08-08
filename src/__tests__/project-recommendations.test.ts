import { describe, expect, it } from 'vitest';

import {
  type ProjectRecommendationRepo,
  rankProjectRecommendations,
} from '@/lib/project-recommendations';

function repo(
  overrides: Partial<ProjectRecommendationRepo> & Pick<ProjectRecommendationRepo, 'id' | 'fullName'>
): ProjectRecommendationRepo {
  return {
    id: overrides.id,
    name: overrides.fullName.split('/')[1],
    fullName: overrides.fullName,
    htmlUrl: `https://github.com/${overrides.fullName}`,
    description: null,
    language: null,
    stargazersCount: 0,
    archived: false,
    topics: [],
    tools: [],
    ...overrides,
  };
}

describe('rankProjectRecommendations', () => {
  it('ranks concrete project evidence above popularity', () => {
    const project = repo({
      id: 1,
      fullName: 'acme/webapp',
      language: 'TypeScript',
      topics: ['payments', 'nextjs'],
      tools: [{ key: 'nextjs', name: 'Next.js', category: 'framework', confidence: 98 }],
    });
    const relevant = repo({
      id: 2,
      fullName: 'oss/payments-kit',
      language: 'TypeScript',
      stargazersCount: 500,
      topics: ['payments'],
      tools: [{ key: 'nextjs', name: 'Next.js', category: 'framework', confidence: 95 }],
    });
    const popular = repo({
      id: 3,
      fullName: 'oss/popular',
      language: 'Rust',
      stargazersCount: 500_000,
    });

    const result = rankProjectRecommendations(project, [popular, relevant]);

    expect(result.fallback).toBe(false);
    expect(result.similarProjects[0].fullName).toBe(relevant.fullName);
    expect(result.similarProjects[0].evidence).toContain('Same primary language: TypeScript');
    expect(result.similarProjects.some((item) => item.id === popular.id)).toBe(false);
  });

  it('labels sparse-context results as broad discovery', () => {
    const project = repo({ id: 1, fullName: 'acme/empty' });
    const candidate = repo({ id: 2, fullName: 'oss/popular', stargazersCount: 10_000 });

    const result = rankProjectRecommendations(project, [candidate]);

    expect(result.fallback).toBe(true);
    expect(result.similarProjects[0].evidence).toEqual([
      'Broad discovery fallback from the public catalog',
    ]);
    expect(result.recommendedTools).toEqual([]);
  });

  it('excludes the connected project and archived repositories', () => {
    const project = repo({ id: 1, fullName: 'acme/app', language: 'Go' });

    expect(
      rankProjectRecommendations(project, [
        project,
        repo({ id: 2, fullName: 'oss/archived', language: 'Go', archived: true }),
      ]).similarProjects
    ).toEqual([]);
  });

  it('derives new tools from similar repositories with exact provenance', () => {
    const project = repo({
      id: 1,
      fullName: 'acme/webapp',
      language: 'TypeScript',
      tools: [{ key: 'nextjs', name: 'Next.js', category: 'framework', confidence: 98 }],
    });
    const peerOne = repo({
      id: 2,
      fullName: 'oss/peer-one',
      language: 'TypeScript',
      tools: [
        { key: 'nextjs', name: 'Next.js', category: 'framework', confidence: 96 },
        { key: 'vitest', name: 'Vitest', category: 'testing', confidence: 94 },
      ],
    });
    const peerTwo = repo({
      id: 3,
      fullName: 'oss/peer-two',
      language: 'TypeScript',
      tools: [{ key: 'vitest', name: 'Vitest', category: 'testing', confidence: 88 }],
    });

    const result = rankProjectRecommendations(project, [peerOne, peerTwo]);

    expect(result.recommendedTools).toHaveLength(1);
    expect(result.recommendedTools[0]).toMatchObject({
      key: 'vitest',
      name: 'Vitest',
      supportCount: 2,
    });
    expect(result.recommendedTools[0].sources).toEqual([
      {
        repoId: 2,
        fullName: 'oss/peer-one',
        htmlUrl: 'https://github.com/oss/peer-one',
        confidence: 94,
      },
      {
        repoId: 3,
        fullName: 'oss/peer-two',
        htmlUrl: 'https://github.com/oss/peer-two',
        confidence: 88,
      },
    ]);
    expect(result.recommendedTools.some((tool) => tool.key === 'nextjs')).toBe(false);
  });

  it('uses topic, category, and metadata evidence when exact tools differ', () => {
    const project = repo({
      id: 1,
      fullName: 'acme/payments',
      name: 'checkout',
      description: 'Payment orchestration service',
      topics: ['payments'],
      tools: [{ key: 'nextjs', name: 'Next.js', category: 'framework', confidence: 95 }],
    });
    const peer = repo({
      id: 2,
      fullName: 'oss/checkout-kit',
      name: 'checkout-kit',
      description: 'Payment orchestration toolkit',
      topics: ['payments'],
      tools: [{ key: 'remix', name: 'Remix', category: 'framework', confidence: 90 }],
    });

    const [match] = rankProjectRecommendations(project, [peer]).similarProjects;

    expect(match.evidence).toContain('Shared topics: payments');
    expect(match.evidence).toContain('Related tool areas: framework');
    expect(match.evidence).toContain('Related context: payment, orchestration');
  });

  it('orders peers by evidence, popularity, and stable repository name', () => {
    const project = repo({
      id: 1,
      fullName: 'acme/app',
      language: 'TypeScript',
      topics: ['payments'],
    });
    const strongest = repo({
      id: 2,
      fullName: 'oss/strongest',
      language: 'TypeScript',
      topics: ['payments'],
      stargazersCount: 1,
    });
    const popular = repo({
      id: 3,
      fullName: 'oss/popular',
      language: 'TypeScript',
      stargazersCount: 100,
    });
    const alphabetical = repo({
      id: 4,
      fullName: 'oss/alphabetical',
      language: 'TypeScript',
      stargazersCount: 100,
    });

    expect(
      rankProjectRecommendations(project, [popular, alphabetical, strongest]).similarProjects.map(
        (item) => item.fullName
      )
    ).toEqual(['oss/strongest', 'oss/alphabetical', 'oss/popular']);
  });

  it('orders grounded tools by peer support, score, and name while deduplicating evidence', () => {
    const project = repo({ id: 1, fullName: 'acme/app', language: 'TypeScript' });
    const peerOne = repo({
      id: 2,
      fullName: 'oss/one',
      language: 'TypeScript',
      tools: [
        { key: 'alpha', name: 'Alpha', category: 'testing', confidence: 150 },
        { key: 'alpha', name: 'Alpha', category: 'testing', confidence: 150 },
        { key: 'beta', name: 'Beta', category: 'testing', confidence: 90 },
        { key: 'delta', name: 'Delta', category: 'testing', confidence: 90 },
        { key: '', name: 'Invalid', category: 'testing', confidence: 100 },
      ],
    });
    const peerTwo = repo({
      id: 3,
      fullName: 'oss/two',
      language: 'TypeScript',
      tools: [
        { key: 'alpha', name: 'Alpha', category: 'testing', confidence: -5 },
        { key: 'gamma', name: 'Gamma', category: 'testing', confidence: 10 },
      ],
    });

    const tools = rankProjectRecommendations(project, [peerOne, peerTwo]).recommendedTools;

    expect(tools.map((tool) => tool.name)).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    expect(tools[0].supportCount).toBe(2);
    expect(tools[0].sources).toHaveLength(2);
  });

  it('handles empty metadata and clamps the requested peer limit', () => {
    const project = repo({ id: 1, fullName: 'acme/empty', name: '' });
    const peers = Array.from({ length: 60 }, (_, index) =>
      repo({ id: index + 2, fullName: `oss/repo-${String(index).padStart(2, '0')}` })
    );

    expect(rankProjectRecommendations(project, peers, 0).similarProjects).toHaveLength(1);
    expect(rankProjectRecommendations(project, peers, 100).similarProjects).toHaveLength(50);
  });
});
