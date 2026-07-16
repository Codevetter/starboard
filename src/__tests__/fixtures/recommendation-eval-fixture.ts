import type { FleetProjectSnapshot, FleetRepoCandidate } from '@/lib/fleet-projects';
import { inferFeatureAreas, semanticKey } from '@/lib/fleet-projects';
import type { RecommendationEvalFixture } from '@/lib/recommendation-eval';

const now = '2026-05-01T00:00:00Z';

function repo(
  id: number,
  fullName: string,
  overrides: Partial<FleetRepoCandidate> = {}
): FleetRepoCandidate {
  const name = fullName.split('/').pop() ?? fullName;
  return {
    id,
    name,
    fullName,
    htmlUrl: `https://github.com/${fullName}`,
    description: overrides.description ?? `${name} library`,
    language: overrides.language ?? 'TypeScript',
    stargazersCount: overrides.stargazersCount ?? 1200,
    archived: overrides.archived ?? false,
    topics: overrides.topics ?? [],
    repoUpdatedAt: overrides.repoUpdatedAt ?? now,
    starredAt: overrides.starredAt ?? '2026-04-01T00:00:00Z',
    isSaved: overrides.isSaved ?? false,
    ai: overrides.ai ?? null,
  };
}

const codeVetterProject: FleetProjectSnapshot = {
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
    'Feature map: repo intelligence, testing and quality. Existing stack: React, Tauri, Vitest.',
  featureAreas: inferFeatureAreas({
    description: 'AI code review platform with static analysis and runtime verification',
    statusSummary: 'Evidence-backed verification loop for agent-written code.',
    plannedNext: ['Add runtime verification and replay checks'],
    readmeSummary: 'Static review plus repo history, runtime checks, replay, and fix revalidation.',
    dependencies: ['@tauri-apps/api', 'react', 'vitest'],
  }),
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

const starboardProject: FleetProjectSnapshot = {
  slug: 'starboard',
  name: 'starboard',
  description: 'GitHub stars organizer with semantic search and recommendations.',
  url: 'https://github.com/Codevetter/starboard.git',
  tier: 'core',
  category: 'product',
  priority: 'P1',
  maturity: 'public',
  sourcePath: 'starboard',
  statusSummary: 'Hybrid search, project recommendations, and radar signals.',
  plannedNext: ['Fixture-backed ranking eval harness'],
  deferred: [],
  readmeSummary: 'Sync starred repos, tag them, and run semantic vector search with RRF fusion.',
  recommendationContext:
    'Feature map: search and discovery, ingestion and sync, Cloudflare deploy.',
  featureAreas: inferFeatureAreas({
    description: 'GitHub stars organizer with semantic search and recommendations',
    statusSummary: 'Hybrid search, project recommendations, and radar signals.',
    plannedNext: ['Fixture-backed ranking eval harness'],
    readmeSummary: 'Sync starred repos, tag them, and run semantic vector search with RRF fusion.',
    dependencies: ['next', '@libsql/client', 'swr'],
  }),
  stack: {
    dependencies: ['next', '@libsql/client', 'swr', 'nuqs'],
    devDependencies: ['vitest', 'typescript'],
    packageNames: ['starboard'],
    languages: ['TypeScript'],
    frameworks: ['Next.js', 'React', 'Tailwind'],
    configFiles: ['next.config.ts'],
  },
  contextText:
    'starboard github stars organizer semantic search recommendations sync embeddings cloudflare workers discovery ranking',
};

const voidZeroProject: FleetProjectSnapshot = {
  slug: 'voidzero-site',
  name: 'voidzero-site',
  description: 'Marketing site for the VoidZero ecosystem.',
  url: 'https://github.com/sarthak-fleet/voidzero-site.git',
  tier: 'marketing',
  category: 'content',
  priority: 'P2',
  maturity: 'public',
  sourcePath: 'voidzero-site',
  statusSummary: 'Static Astro marketing surface with fast LCP.',
  plannedNext: ['Inline critical CSS on prerender'],
  deferred: [],
  readmeSummary: 'Astro content site with Tailwind v4 and Lightning CSS.',
  recommendationContext: 'Feature map: content and media, UI workflows.',
  featureAreas: inferFeatureAreas({
    description: 'Marketing site for the VoidZero ecosystem with Astro and Tailwind',
    statusSummary: 'Static Astro marketing surface with fast LCP.',
    plannedNext: ['Inline critical CSS on prerender'],
    readmeSummary: 'Astro content site with Tailwind v4 and Lightning CSS.',
    dependencies: [],
  }),
  stack: {
    dependencies: [],
    devDependencies: ['typescript'],
    packageNames: ['voidzero-site'],
    languages: ['TypeScript'],
    frameworks: ['Astro', 'Tailwind'],
    configFiles: ['astro.config.mjs'],
  },
  contextText:
    'voidzero marketing astro content site tailwind lightning css publishing landing pages',
};

const sharedCandidates: FleetRepoCandidate[] = [
  repo(101, 'Byron/gitoxide', {
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
  }),
  repo(102, 'facebook/react', {
    description: 'The library for web and native user interfaces.',
    topics: ['react', 'ui'],
    stargazersCount: 230000,
  }),
  repo(103, 'vitest-dev/vitest', {
    description: 'Next generation testing framework powered by Vite.',
    topics: ['testing', 'vitest', 'vite'],
    stargazersCount: 14000,
  }),
  repo(104, 'langchain-ai/langchain', {
    description: 'Build context-aware reasoning applications with LLMs.',
    topics: ['ai', 'llm', 'rag', 'agents'],
    stargazersCount: 98000,
  }),
  repo(105, 'cloudflare/workers-sdk', {
    description: 'Tools to build on Cloudflare Workers, Pages, and related products.',
    topics: ['cloudflare', 'workers', 'wrangler'],
    stargazersCount: 3200,
  }),
  repo(106, 'tursodatabase/libsql', {
    description: 'libSQL is a fork of SQLite that is both Open Source, and Open Contributions.',
    topics: ['database', 'sqlite', 'libsql', 'turso'],
    stargazersCount: 11000,
  }),
  repo(107, 'withastro/astro', {
    description: 'The web framework for content-driven websites.',
    topics: ['astro', 'content', 'static'],
    stargazersCount: 47000,
  }),
  repo(108, 'TanStack/query', {
    description: 'Powerful asynchronous state management for TS/JS.',
    topics: ['react', 'query', 'data'],
    stargazersCount: 43000,
  }),
  repo(109, 'owner/old-review', {
    archived: true,
    description: 'Static analysis and code review',
    topics: ['static', 'analysis', 'review'],
    repoUpdatedAt: '2021-01-01T00:00:00Z',
    stargazersCount: 400,
  }),
  repo(110, 'promptfoo/promptfoo', {
    description: 'Test your LLM app prompts and agents with evals and red teaming.',
    topics: ['eval', 'llm', 'testing', 'benchmark'],
    stargazersCount: 6200,
  }),
  repo(111, 'vercel/next.js', {
    description: 'The React Framework for production.',
    topics: ['next', 'react', 'framework'],
    stargazersCount: 130000,
  }),
  repo(112, 'qdrant/qdrant', {
    description: 'Vector similarity search engine and database.',
    topics: ['vector', 'search', 'semantic', 'retrieval'],
    stargazersCount: 22000,
  }),
  repo(113, 'tailwindlabs/tailwindcss', {
    description: 'A utility-first CSS framework.',
    topics: ['tailwind', 'css', 'ui'],
    stargazersCount: 86000,
  }),
  repo(114, 'playwright-community/awesome-playwright', {
    description: 'A curated list of awesome Playwright resources.',
    topics: ['awesome-list', 'playwright'],
    stargazersCount: 900,
  }),
  repo(115, 'meilisearch/meilisearch', {
    description: 'A lightning-fast search engine.',
    topics: ['search', 'index', 'retrieval'],
    stargazersCount: 50000,
  }),
  repo(116, 'opennextjs/opennextjs-cloudflare', {
    description: 'OpenNext adapter for Cloudflare Workers.',
    topics: ['cloudflare', 'workers', 'next', 'deploy'],
    stargazersCount: 1800,
  }),
  repo(117, 'owner/sparse', {
    description: null,
    topics: [],
    language: null,
    stargazersCount: 12,
    repoUpdatedAt: '2023-01-01T00:00:00Z',
  }),
  repo(118, 'trpc/trpc', {
    description: 'End-to-end typesafe APIs made easy.',
    topics: ['typescript', 'api', 'rpc'],
    stargazersCount: 36000,
  }),
  repo(119, 'withastro/starlight', {
    description: 'Documentation framework for Astro.',
    topics: ['astro', 'docs', 'content', 'markdown'],
    stargazersCount: 5200,
  }),
  repo(120, 'microsoft/playwright', {
    description: 'Playwright is a framework for Web Testing and Automation.',
    topics: ['testing', 'playwright', 'browser'],
    stargazersCount: 72000,
  }),
];

const voidzeroCandidates: FleetRepoCandidate[] = [
  repo(201, 'withastro/astro', {
    description: 'The web framework for content-driven websites.',
    topics: ['astro', 'content', 'static', 'markdown'],
    stargazersCount: 47000,
  }),
  repo(202, 'withastro/starlight', {
    description: 'Documentation framework for Astro content sites.',
    topics: ['astro', 'docs', 'content', 'markdown', 'publish'],
    stargazersCount: 5200,
  }),
  repo(203, 'tailwindlabs/tailwindcss', {
    description: 'A utility-first CSS framework for modern UI workflows.',
    topics: ['tailwind', 'css', 'ui'],
    stargazersCount: 86000,
  }),
  repo(204, 'langchain-ai/langchain', {
    description: 'Build context-aware reasoning applications with LLMs.',
    topics: ['ai', 'llm', 'rag', 'agents'],
    stargazersCount: 98000,
  }),
  repo(205, 'owner/sparse', {
    description: null,
    topics: [],
    language: null,
    stargazersCount: 12,
    repoUpdatedAt: '2023-01-01T00:00:00Z',
  }),
];

export const recommendationEvalFixtures: RecommendationEvalFixture[] = [
  {
    id: 'codevetter-repo-intelligence',
    project: codeVetterProject,
    candidates: sharedCandidates,
    semanticDistances: new Map([[semanticKey(101, 'repo-intelligence'), 0.22]]),
    expectations: {
      topK: 6,
      topRecommendations: [
        {
          fullName: 'Byron/gitoxide',
          featureAreaId: 'repo-intelligence',
          reasonIncludes: ['history', 'analysis'],
        },
        {
          fullName: 'promptfoo/promptfoo',
          featureAreaId: 'testing-quality',
          reasonIncludes: ['test', 'eval'],
        },
        {
          fullName: 'microsoft/playwright',
          featureAreaId: 'testing-quality',
          reasonIncludes: ['testing'],
        },
      ],
      suppressed: [
        { fullName: 'facebook/react', reason: 'dependency' },
        { fullName: 'owner/old-review', reason: 'archived' },
        { fullName: 'owner/sparse', reason: 'lowSignal' },
      ],
    },
  },
  {
    id: 'starboard-search-discovery',
    project: starboardProject,
    candidates: sharedCandidates,
    semanticDistances: new Map([
      [semanticKey(115, 'search-discovery'), 0.18],
      [semanticKey(112, 'search-discovery'), 0.25],
    ]),
    expectations: {
      topK: 5,
      topRecommendations: [
        {
          fullName: 'meilisearch/meilisearch',
          featureAreaId: 'search-discovery',
          reasonIncludes: ['search'],
        },
        {
          fullName: 'qdrant/qdrant',
          featureAreaId: 'search-discovery',
        },
        {
          fullName: 'promptfoo/promptfoo',
          featureAreaId: 'testing-quality',
          reasonIncludes: ['eval'],
        },
      ],
      suppressed: [
        { fullName: 'vercel/next.js', reason: 'dependency' },
        { fullName: 'playwright-community/awesome-playwright', reason: 'lowSignal' },
      ],
    },
  },
  {
    id: 'voidzero-content-ui',
    project: voidZeroProject,
    candidates: voidzeroCandidates,
    semanticDistances: new Map([[semanticKey(201, 'content-media'), 0.2]]),
    expectations: {
      topK: 4,
      topRecommendations: [
        {
          fullName: 'withastro/starlight',
          featureAreaId: 'content-media',
        },
        {
          fullName: 'withastro/astro',
          featureAreaId: 'content-media',
        },
        {
          fullName: 'tailwindlabs/tailwindcss',
          featureAreaId: 'ui-workflows',
        },
      ],
      suppressed: [{ fullName: 'owner/sparse', reason: 'lowSignal' }],
    },
  },
];

/**
 * Extend this fixture when a new project surface ships:
 * 1. Add a FleetProjectSnapshot with realistic stack + feature areas.
 * 2. Reuse sharedCandidates or add scenario-specific repos.
 * 3. Record expected top-k hits and suppression reasons before tuning production scoring.
 */
export const recommendationEvalFixtureProjects = [
  codeVetterProject,
  starboardProject,
  voidZeroProject,
];

export const recommendationEvalFixtureCandidates = sharedCandidates;
