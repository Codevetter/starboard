import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { expect, test } from 'vitest';

import {
  type ProjectRecommendationRepo,
  rankProjectRecommendations,
} from '@/lib/project-recommendations';

const SIZES = [1000, 10_000, 50_000];
const ITERATIONS = 10;
const EXPECTED_DIGESTS = new Map([
  [1000, 'e0d69564422b1c2001a1cf8a95988e5cc17343aca618cce3a55722cbea4028d2'],
  [10_000, '37d8530331d21849e958ca398a7c57279fdb9491758aaf31f7a6766cc9e01ac3'],
  [50_000, '241e9f5bbb8b97241f38214cd25fc937e75a853fc2b09c78fc23b5d1939302ee'],
]);

test('project recommendations scale across local catalog sizes', { timeout: 30_000 }, () => {
  const project = buildProject();
  const largestCatalog = buildCatalog(SIZES.at(-1) ?? 0);
  const metrics: string[] = [];

  for (const size of SIZES) {
    const catalog = largestCatalog.slice(0, size);
    const expected = JSON.stringify(rankProjectRecommendations(project, catalog));
    expect(createHash('sha256').update(expected).digest('hex')).toBe(EXPECTED_DIGESTS.get(size));
    let durationMs = 0;

    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      const startedAt = performance.now();
      const result = rankProjectRecommendations(project, catalog);
      durationMs += performance.now() - startedAt;
      expect(JSON.stringify(result)).toBe(expected);
    }

    metrics.push(`size${size}=${(durationMs / ITERATIONS).toFixed(3)}ms/op`);
  }

  console.log(`[benchmark] ${metrics.join(' ')} (${ITERATIONS} iterations)`);
  console.log(`[resource] largest_catalog_rows=${largestCatalog.length}`);
});

function buildProject(): ProjectRecommendationRepo {
  return {
    id: 1,
    name: 'agent-workbench',
    fullName: 'acme/agent-workbench',
    htmlUrl: 'https://github.com/acme/agent-workbench',
    description: 'TypeScript agent testing and evaluation workbench',
    language: 'TypeScript',
    stargazersCount: 100,
    archived: false,
    topics: ['agents', 'testing', 'evaluation'],
    aiSummary: 'Tools for evaluating coding agents',
    aiCategory: 'developer-tools',
    aiKeywords: ['benchmark', 'verification'],
    tools: [{ key: 'nextjs', name: 'Next.js', category: 'framework', confidence: 98 }],
  };
}

function buildCatalog(size: number): ProjectRecommendationRepo[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index + 2,
    name: `project-${index}`,
    fullName: `catalog/project-${String(index).padStart(6, '0')}`,
    htmlUrl: `https://github.com/catalog/project-${index}`,
    description:
      index % 3 === 0
        ? 'Agent testing and benchmark utilities'
        : 'General TypeScript developer utilities',
    language: index % 11 === 0 ? 'Go' : 'TypeScript',
    stargazersCount: (index * 7919) % 100_000,
    archived: index % 101 === 0,
    topics: index % 3 === 0 ? ['agents', 'testing'] : ['developer-tools'],
    aiSummary: index % 5 === 0 ? 'Evaluation and verification for agents' : null,
    aiCategory: 'developer-tools',
    aiKeywords: index % 7 === 0 ? ['benchmark', 'verification'] : [],
    tools: [
      { key: 'typescript', name: 'TypeScript', category: 'language', confidence: 99 },
      ...(index % 4 === 0
        ? [{ key: 'vitest', name: 'Vitest', category: 'testing', confidence: 90 }]
        : []),
    ],
  }));
}
