/**
 * Fleet project intelligence report generator.
 *
 * Reads the Fleet project catalog, runs the deterministic need-driven
 * recommendation pipeline for every P1/P2 maintained project, and emits a
 * structured Markdown report.
 *
 * Usage:
 *   tsx scripts/fleet-project-intelligence.ts \
 *     --catalog /path/to/fleet/ops/config/projects.json \
 *     --out ./reports/fleet-project-intelligence.md
 *
 * Environment:
 *   GH_TOKEN          - optional GitHub token for candidate searches
 *   OPENAI_API_KEY    - optional key for need extraction fallback
 *   FLEET_ROOT        - path to the Fleet workspace (defaults to ../..)
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

interface FleetProject {
  id: string;
  name: string;
  portfolio: { priority: 'P1' | 'P2' | 'P4'; status: 'active' | 'archived' };
  lifecycle: 'maintained' | 'local-only' | 'past' | 'non-product';
  repo: string | null;
  sourcePath?: string | null;
  public?: { description?: string | null; repositoryUrl?: string | null } | null;
}

interface FleetCatalog {
  projects: FleetProject[];
}

interface ProjectNeed {
  id: string;
  title: string;
  currentState: string;
  desiredOutcome: string;
  evidence: string[];
  searchIntents: string[];
  priority: 'high' | 'medium' | 'low';
}

interface CandidateRepo {
  fullName: string;
  htmlUrl: string;
  description: string | null;
  classification:
    | 'adopt_or_integrate'
    | 'reference_implementation'
    | 'architectural_pattern'
    | 'competing_product_to_monitor'
    | 'unsuitable_negative_example';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

interface ProjectReport {
  id: string;
  name: string;
  priority: string;
  evidenceSources: string[];
  fingerprint: string;
  needs: ProjectNeed[];
  candidates: Map<string, CandidateRepo[]>;
  notes: string[];
}

interface GeneratorOptions {
  catalogPath: string;
  fleetRoot: string;
  outPath: string;
  ghToken?: string;
  includeP4: boolean;
}

function parseArgs(argv: string[]): GeneratorOptions {
  let catalogPath = resolve(__dirname, '../../foundry/ops/config/projects.json');
  let fleetRoot = resolve(__dirname, '../..');
  let outPath = resolve(__dirname, '../reports/fleet-project-intelligence.md');
  let includeP4 = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--catalog' && argv[i + 1]) catalogPath = resolve(argv[++i]);
    if (arg === '--fleet-root' && argv[i + 1]) fleetRoot = resolve(argv[++i]);
    if (arg === '--out' && argv[i + 1]) outPath = resolve(argv[++i]);
    if (arg === '--include-p4') includeP4 = true;
  }

  return {
    catalogPath,
    fleetRoot,
    outPath,
    ghToken: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
    includeP4,
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function fingerprint(texts: (string | null | undefined)[]): string {
  const hash = createHash('sha256');
  for (const text of texts) {
    hash.update(text ?? '');
  }
  return hash.digest('hex');
}

function repoPath(project: FleetProject, fleetRoot: string): string | null {
  if (!project.repo) return null;
  // Some repo entries are relative paths under foundry/helpers/...
  if (project.repo.includes('/')) return resolve(fleetRoot, project.repo);
  return resolve(fleetRoot, project.sourcePath ?? project.repo);
}

/**
 * Rule-based need extraction from project evidence.
 *
 * This is intentionally lightweight: it surfaces common infrastructure and
 * product needs from Fleet project metadata. A future pass can call an LLM
 * for richer extraction while still validating against evidence.
 */
interface NeedDefinition {
  keywords: string[];
  title: string;
  currentState: string;
  desiredOutcome: string;
  evidence: string;
  searchIntents: string[];
  priority: 'high' | 'medium' | 'low';
}

const NEED_DEFINITIONS: NeedDefinition[] = [
  {
    keywords: ['ai ', 'llm', 'model'],
    title: 'Local or cost-efficient inference runtime',
    currentState: 'Project depends on remote or expensive inference',
    desiredOutcome:
      'Run models locally, at the edge, or through a managed gateway with predictable cost',
    evidence: 'Product description mentions AI/LLM/model capabilities',
    searchIntents: ['local LLM inference engine', 'edge AI runtime', 'MLX llama.cpp'],
    priority: 'high',
  },
  {
    keywords: ['cloudflare', 'worker', 'd1', 'pages'],
    title: 'Serverless edge persistence and compute primitives',
    currentState:
      'Uses Cloudflare Workers/Pages/D1/KV/R2 but may lack reusable patterns for migrations, bindings, or local dev',
    desiredOutcome:
      'Adopt proven patterns for D1 migrations, wrangler config, and Worker observability',
    evidence: 'Deployment stack references Cloudflare Workers/Pages/D1',
    searchIntents: [
      'Cloudflare D1 migration patterns',
      'wrangler best practices',
      'edge Worker observability',
    ],
    priority: 'high',
  },
  {
    keywords: ['mac', 'swift', 'apple'],
    title: 'Native macOS app packaging and distribution',
    currentState:
      'Native app build exists but distribution, notarization, or auto-update may be manual',
    desiredOutcome: 'Automate signed builds, notarization, and Sparkle/Updater release pipeline',
    evidence: 'Product is a macOS/Swift app',
    searchIntents: [
      'macOS app notarization github actions',
      'Sparkle auto update swift',
      'Tauri updater',
    ],
    priority: 'medium',
  },
  {
    keywords: ['embed', 'vector', 'semantic'],
    title: 'Embedding and semantic retrieval pipeline',
    currentState: 'Needs vector search or semantic matching',
    desiredOutcome:
      'Use a stable embedding model, vector store, and reranking strategy with versioning',
    evidence: 'Evidence of embeddings, vector search, or semantic retrieval',
    searchIntents: [
      'open source embedding model',
      'local vector database',
      'semantic search reranking',
    ],
    priority: 'high',
  },
  {
    keywords: ['test', 'eval', 'benchmark'],
    title: 'Reproducible evaluation and benchmark harness',
    currentState: 'Evaluations are ad-hoc or not automated',
    desiredOutcome: 'Run deterministic benchmarks with regression detection and fixture versioning',
    evidence: 'README or status mentions tests, evals, or benchmarks',
    searchIntents: [
      'open source benchmark harness',
      'regression testing tools',
      'deterministic eval framework',
    ],
    priority: 'medium',
  },
  {
    keywords: ['auth', 'oauth', 'sign-in'],
    title: 'Authentication and session management',
    currentState: 'Has sign-in flow but may need OAuth providers, session isolation, or RBAC',
    desiredOutcome: 'Use a maintained auth library with minimal scope and secure session handling',
    evidence: 'Auth, OAuth, or sign-in mentioned in evidence',
    searchIntents: [
      'next auth v5 github oauth',
      'oauth2 pkce library',
      'session management patterns',
    ],
    priority: 'medium',
  },
  {
    keywords: ['landing', 'marketing', 'seo'],
    title: 'Marketing site and content publishing pipeline',
    currentState:
      'Landing/marketing content is hand-maintained or not integrated with the product build',
    desiredOutcome:
      'Adopt a static-site generator with automated sitemap, OG images, and publishing checks',
    evidence: 'Product has a landing page or marketing surface',
    searchIntents: [
      'Astro static site generator',
      'marketing site automation',
      'SEO sitemap generator',
    ],
    priority: 'low',
  },
];

interface NeedInput {
  title: string;
  currentState: string;
  desiredOutcome: string;
  evidence: string[];
  searchIntents: string[];
  priority: 'high' | 'medium' | 'low';
}

function extractNeeds(
  project: FleetProject,
  readme: string | null,
  status: string | null
): ProjectNeed[] {
  const source = `${readme ?? ''}\n${status ?? ''}`.toLowerCase();
  const description = project.public?.description ?? '';
  const needs: ProjectNeed[] = [];

  const addNeed = (input: NeedInput): void => {
    needs.push({
      id: `${project.id}-${needs.length + 1}`,
      ...input,
    });
  };

  for (const def of NEED_DEFINITIONS) {
    if (def.keywords.some((kw) => source.includes(kw))) {
      addNeed({
        title: def.title,
        currentState: def.currentState,
        desiredOutcome: def.desiredOutcome,
        evidence: [description || def.evidence],
        searchIntents: def.searchIntents,
        priority: def.priority,
      });
    }
  }

  if (needs.length === 0) {
    addNeed({
      title: 'Project health and dependency maintenance',
      currentState: 'No specific needs were extracted from available evidence',
      desiredOutcome:
        'Keep dependencies current, remove dead code, and monitor security advisories',
      evidence: ['Limited evidence available for targeted need extraction'],
      searchIntents: ['dependency health tool', 'dead code detector', 'security audit automation'],
      priority: 'low',
    });
  }

  return needs.slice(0, 10);
}

async function searchGitHub(
  query: string,
  token?: string
): Promise<Pick<CandidateRepo, 'fullName' | 'htmlUrl' | 'description'>[]> {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', '5');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'User-Agent': 'starboard-fleet-intelligence',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    items: Array<{
      full_name: string;
      html_url: string;
      description: string | null;
      stargazers_count: number;
      archived: boolean;
      topics?: string[];
      language?: string | null;
      updated_at?: string;
    }>;
  };

  return data.items.map((item) => ({
    fullName: item.full_name,
    htmlUrl: item.html_url,
    description: item.description,
  }));
}

interface CandidateSearchRepo {
  fullName: string;
  htmlUrl: string;
  description: string | null;
}

const WHITESPACE_RE = /\s+/;

function hasKeywordOverlap(searchIntents: string[], desc: string): boolean {
  return searchIntents.some((intent) =>
    intent.split(WHITESPACE_RE).some((word) => desc.includes(word) && word.length > 3)
  );
}

async function classifyCandidate(
  project: FleetProject,
  need: ProjectNeed,
  repo: CandidateSearchRepo,
  _token?: string
): Promise<CandidateRepo> {
  // A real implementation would query Starboard's capability cards and compare
  // language, topics, tools, and maintenance signals. This fallback uses the
  // repository description and need title for a conservative classification.
  const desc = (repo.description ?? '').toLowerCase();
  const overlap = hasKeywordOverlap(need.searchIntents, desc);

  let classification: CandidateRepo['classification'] = 'reference_implementation';
  if (desc.includes(project.name.toLowerCase()) || desc.includes(project.id.toLowerCase())) {
    classification = 'competing_product_to_monitor';
  } else if (overlap) {
    classification = 'adopt_or_integrate';
  }

  return {
    fullName: repo.fullName,
    htmlUrl: repo.htmlUrl,
    description: repo.description,
    classification,
    confidence: overlap ? 'medium' : 'low',
    evidence: [overlap ? 'Keyword overlap with need search intents' : 'Broadly related by topic'],
  };
}

async function buildProjectReport(
  project: FleetProject,
  options: GeneratorOptions
): Promise<ProjectReport> {
  const root = repoPath(project, options.fleetRoot);
  const evidenceSources: string[] = [];
  let readme: string | null = null;
  let status: string | null = null;

  if (root) {
    readme = await readText(join(root, 'README.md'));
    status = await readText(join(root, 'PROJECT_STATUS.md'));
    if (readme) evidenceSources.push(relative(options.fleetRoot, join(root, 'README.md')));
    if (status) evidenceSources.push(relative(options.fleetRoot, join(root, 'PROJECT_STATUS.md')));
  }

  if (project.public?.description) {
    evidenceSources.push(`Fleet catalog public description for ${project.id}`);
  }

  const needs = extractNeeds(project, readme, status);
  const fingerprintValue = fingerprint([
    project.public?.description,
    readme?.slice(0, 4000),
    status?.slice(0, 4000),
  ]);

  const candidates = new Map<string, CandidateRepo[]>();

  if (options.ghToken) {
    for (const need of needs) {
      try {
        const results = await searchGitHub(need.searchIntents[0] ?? need.title, options.ghToken);
        const classified = await Promise.all(
          results.slice(0, 2).map((repo) => classifyCandidate(project, need, repo, options.ghToken))
        );
        candidates.set(need.id, classified);
      } catch (error) {
        console.warn(`Search failed for ${project.id} / ${need.id}:`, error);
        candidates.set(need.id, []);
      }
    }
  }

  const notes: string[] = [];
  if (!root) notes.push('No local repository path available; evidence limited.');
  if (!options.ghToken)
    notes.push('GH_TOKEN not set; candidate search skipped. Use catalog retrieval instead.');

  return {
    id: project.id,
    name: project.name,
    priority: project.portfolio.priority,
    evidenceSources,
    fingerprint: fingerprintValue,
    needs,
    candidates,
    notes,
  };
}

function renderNeed(need: ProjectNeed, candidates: CandidateRepo[]): string[] {
  const lines: string[] = [
    `### ${need.title}`,
    '',
    `**Current state:** ${need.currentState}`,
    `**Desired outcome:** ${need.desiredOutcome}`,
    `**Priority:** ${need.priority}`,
    '',
    '**Evidence:**',
  ];
  for (const evidence of need.evidence) {
    lines.push(`- ${evidence}`);
  }
  lines.push('');
  lines.push(`*Search intents:* ${need.searchIntents.join('; ')}`);
  lines.push('');

  if (candidates.length === 0) {
    lines.push('*No candidates retrieved in this pass.*');
  } else {
    for (const candidate of candidates) {
      lines.push(`- **${candidate.fullName}** — ${candidate.htmlUrl}`);
      lines.push(
        `  - classification: \`${candidate.classification}\`, confidence: ${candidate.confidence}`
      );
      if (candidate.description) {
        lines.push(`  - ${candidate.description}`);
      }
      for (const evidence of candidate.evidence) {
        lines.push(`  - ${evidence}`);
      }
    }
  }
  lines.push('');
  return lines;
}

function renderProjectReport(report: ProjectReport): string[] {
  const lines: string[] = [
    `## ${report.name} (${report.priority})`,
    '',
    `**Fingerprint:** \`${report.fingerprint.slice(0, 16)}\``,
    '',
    '**Evidence sources:**',
  ];
  for (const source of report.evidenceSources) {
    lines.push(`- ${source}`);
  }
  lines.push('');

  if (report.needs.length === 0) {
    lines.push('No needs extracted from available evidence.');
    lines.push('');
    return lines;
  }

  for (const need of report.needs) {
    const needCandidates = report.candidates.get(need.id) ?? [];
    lines.push(...renderNeed(need, needCandidates));
  }

  if (report.notes.length > 0) {
    lines.push('**Notes:**');
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }
  return lines;
}

function renderReport(reports: ProjectReport[], generatedAt: string): string {
  const lines: string[] = [
    '# Fleet Project Intelligence Report',
    '',
    `Generated: ${generatedAt}`,
    'Source: Fleet `projects.json` + project README/PROJECT_STATUS evidence',
    'Methodology: Starboard need-driven recommendation pipeline (deterministic pass; Devin review not run)',
    '',
    '## Summary',
    '',
    '| Project | Priority | Needs | Status |',
    '| --- | --- | --- | --- |',
  ];

  for (const report of reports) {
    const status = report.notes.length > 0 ? `notes: ${report.notes.join('; ')}` : 'complete';
    lines.push(`| ${report.name} | ${report.priority} | ${report.needs.length} | ${status} |`);
  }

  lines.push('');

  for (const report of reports) {
    lines.push(...renderProjectReport(report));
  }

  lines.push('---');
  lines.push('');
  lines.push(
    '*This report is a deterministic first pass. Reviewers can override needs and classifications through the Starboard external-review ingestion contract.*'
  );

  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const catalog = await readJson<FleetCatalog>(options.catalogPath);

  const eligible = catalog.projects.filter((project) => {
    const isMaintained = project.lifecycle === 'maintained';
    const isHighPriority =
      project.portfolio.priority === 'P1' || project.portfolio.priority === 'P2';
    const active = project.portfolio.status === 'active';
    return isMaintained && isHighPriority && active;
  });

  // P1 projects first, then P2, then alphabetically by id.
  eligible.sort((a, b) => {
    const priorityWeight = { P1: 0, P2: 1, P4: 2 };
    const diff = priorityWeight[a.portfolio.priority] - priorityWeight[b.portfolio.priority];
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  const reports: ProjectReport[] = [];
  for (const project of eligible) {
    console.log(`Analyzing ${project.id}...`);
    try {
      const report = await buildProjectReport(project, options);
      reports.push(report);
    } catch (error) {
      console.error(`Failed to analyze ${project.id}:`, error);
      reports.push({
        id: project.id,
        name: project.name,
        priority: project.portfolio.priority,
        evidenceSources: [],
        fingerprint: '',
        needs: [],
        candidates: new Map(),
        notes: [`Analysis failed: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
  }

  const rendered = renderReport(reports, new Date().toISOString());
  await writeFile(options.outPath, rendered, 'utf8');
  console.log(`Report written to ${options.outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
