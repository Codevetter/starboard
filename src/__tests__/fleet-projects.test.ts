import { describe, expect, it } from 'vitest';

import {
  buildProjectRecommendationReport,
  type FleetProjectSnapshot,
  type FleetRepoCandidate,
  inferFeatureAreas,
  matchesExistingDependency,
  semanticKey,
} from '@/lib/fleet-projects';

const project: FleetProjectSnapshot = {
  slug: 'CodeVetter',
  name: 'CodeVetter',
  description: 'AI code review platform — desktop-first, works offline.',
  url: 'https://github.com/Codevetter/codevetter.git',
  tier: 'core',
  category: 'product',
  priority: 'P1',
  maturity: 'public-ready',
  sourcePath: 'CodeVetter',
  statusSummary: 'Evidence-backed verification loop for agent-written code.',
  plannedNext: ['Add runtime verification and replay checks'],
  deferred: [],
  readmeSummary: 'Static review plus repo history, runtime checks, replay, and fix revalidation.',
  recommendationContext:
    'Feature map: repo intelligence, testing and quality. Existing stack: React, Tauri, Vitest. Recommend evidence-backed repository analysis tooling.',
  featureAreas: [
    {
      id: 'repo-intelligence',
      label: 'Repo intelligence',
      description: 'Repository understanding, static analysis, diffs, and evidence reports.',
      keywords: [
        'repo',
        'repository',
        'static',
        'analysis',
        'diff',
        'history',
        'evidence',
        'review',
      ],
      source: 'inferred',
    },
    {
      id: 'testing-quality',
      label: 'Testing and quality',
      description: 'Runtime verification, browser replay checks, and regressions.',
      keywords: ['test', 'testing', 'runtime', 'verification', 'playwright', 'regression'],
      source: 'inferred',
    },
  ],
  stack: {
    dependencies: ['@tauri-apps/api', 'react'],
    devDependencies: ['vitest', 'typescript'],
    packageNames: ['codevetter'],
    languages: ['TypeScript'],
    frameworks: ['React', 'Tauri', 'Vitest'],
    configFiles: ['vite.config.ts'],
  },
  contextText:
    'CodeVetter AI code review platform desktop first static analysis repo history runtime verification evidence reports TypeScript React Tauri',
};

const baseRepo: FleetRepoCandidate = {
  id: 1,
  name: 'candidate',
  fullName: 'owner/candidate',
  htmlUrl: 'https://github.com/owner/candidate',
  description: 'A useful library',
  language: 'TypeScript',
  stargazersCount: 1000,
  archived: false,
  topics: [],
  repoUpdatedAt: '2026-05-01T00:00:00Z',
  starredAt: '2026-05-02T00:00:00Z',
  isSaved: false,
};

describe('fleet project recommendations', () => {
  const now = new Date('2026-06-06T00:00:00Z');

  it('infers feature areas from project text', () => {
    const features = inferFeatureAreas({
      description: 'GitHub repository search and semantic discovery for AI projects',
      statusSummary: 'Uses embeddings, sync, and recommendations.',
    });

    expect(features.map((feature) => feature.id)).toContain('search-discovery');
    expect(features.map((feature) => feature.id)).toContain('ai-agents');
  });

  it('suppresses repos that match existing dependencies', () => {
    expect(
      matchesExistingDependency(project, {
        name: 'react',
        fullName: 'facebook/react',
        topics: ['ui'],
      })
    ).toBe(true);
  });

  it('ranks relevant repos by feature area and semantic distance', () => {
    const semanticDistances = new Map([[semanticKey(2, 'repo-intelligence'), 0.22]]);
    const report = buildProjectRecommendationReport(
      project,
      [
        {
          ...baseRepo,
          id: 2,
          name: 'gitoxide',
          fullName: 'Byron/gitoxide',
          description: 'A pure Rust implementation of Git for repository history analysis',
          language: 'Rust',
          stargazersCount: 12000,
          topics: ['git', 'repository', 'history', 'analysis'],
          ai: {
            summary: 'Repository history tooling.',
            category: 'devtool',
            subcategories: ['git'],
            useCases: ['analyze repository history'],
            keywords: ['repo', 'history', 'analysis'],
          },
        },
        {
          ...baseRepo,
          id: 3,
          name: 'react',
          fullName: 'facebook/react',
          description: 'The library for web and native user interfaces.',
          topics: ['react', 'ui'],
        },
      ],
      { now, semanticDistances }
    );

    expect(report.recommendations[0].fullName).toBe('Byron/gitoxide');
    expect(report.recommendations[0].featureArea.id).toBe('repo-intelligence');
    expect(report.suppressed.dependencyMatches).toBe(1);
  });

  it('does not promote archived stale repos', () => {
    const report = buildProjectRecommendationReport(
      project,
      [
        {
          ...baseRepo,
          id: 4,
          name: 'old-review',
          fullName: 'owner/old-review',
          archived: true,
          description: 'Static analysis and code review',
          topics: ['static', 'analysis', 'review'],
          repoUpdatedAt: '2021-01-01T00:00:00Z',
        },
      ],
      { now }
    );

    expect(report.recommendations).toHaveLength(0);
    expect(report.suppressed.archived).toBe(1);
  });
});
