export type FleetRecommendationAction = "use-now" | "prototype" | "research" | "skip";

export interface FleetFeatureArea {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  source: "inferred" | "status" | "readme" | "registry";
}

export interface FleetProjectSnapshot {
  slug: string;
  name: string;
  description: string;
  url: string;
  tier: string;
  category: string;
  priority: string;
  sourcePath: string;
  statusSummary: string;
  plannedNext: string[];
  deferred: string[];
  readmeSummary: string;
  featureAreas: FleetFeatureArea[];
  stack: {
    dependencies: string[];
    devDependencies: string[];
    packageNames: string[];
    languages: string[];
    frameworks: string[];
    configFiles: string[];
  };
  contextText: string;
}

export interface FleetRepoCandidate {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  archived: boolean;
  topics: string[];
  repoUpdatedAt: string | null;
  starredAt: string | null;
  isSaved: boolean;
  ai?: {
    summary: string | null;
    category: string | null;
    subcategories: string[];
    useCases: string[];
    keywords: string[];
  } | null;
}

export interface FleetRecommendation extends FleetRepoCandidate {
  featureArea: FleetFeatureArea;
  action: FleetRecommendationAction;
  score: number;
  reasons: string[];
  cautions: string[];
  suggestedUse: string;
  semanticDistance: number | null;
}

export interface FleetProjectRecommendationReport {
  project: FleetProjectSnapshot;
  recommendations: FleetRecommendation[];
  byFeatureArea: {
    featureArea: FleetFeatureArea;
    recommendations: FleetRecommendation[];
  }[];
  suppressed: {
    dependencyMatches: number;
    archived: number;
    lowSignal: number;
  };
  summary: {
    candidateRepos: number;
    returned: number;
    useNow: number;
    prototype: number;
    research: number;
    topLanguages: [string, number][];
  };
  markdown: string;
}

export type SemanticDistanceMap = Map<string, number>;

const DAY_MS = 24 * 60 * 60 * 1000;

const GENERIC_TOKENS = new Set([
  "app",
  "apps",
  "and",
  "any",
  "are",
  "auth",
  "based",
  "build",
  "built",
  "code",
  "com",
  "current",
  "data",
  "dev",
  "docs",
  "done",
  "for",
  "from",
  "generated",
  "github",
  "helper",
  "http",
  "https",
  "into",
  "local",
  "main",
  "many",
  "more",
  "next",
  "one",
  "open",
  "platform",
  "platform.",
  "project",
  "projects",
  "public",
  "repo",
  "repos",
  "service",
  "source",
  "stack",
  "system",
  "that",
  "the",
  "them",
  "tool",
  "tools",
  "type",
  "typed",
  "typescript",
  "use",
  "uses",
  "using",
  "user",
  "users",
  "via",
  "web",
  "with",
  "your",
]);

const LOW_VALUE_MATCH_TERMS = new Set([
  "code",
  "edge",
  "interactive",
  "model",
  "models",
  "next",
  "react",
  "runtime",
  "system",
  "systems",
  "tool",
  "tools",
  "user",
  "users",
  "workflow",
  "workflows",
]);

const LOW_VALUE_PROJECT_OVERLAP = new Set([
  ...GENERIC_TOKENS,
  "actions",
  "api",
  "core",
  "deploy",
  "google",
  "node",
  "openai",
  "product",
  "software",
  "storage",
  "worker",
  "workers",
]);

const FEATURE_RULES: Omit<FleetFeatureArea, "source">[] = [
  {
    id: "repo-intelligence",
    label: "Repo intelligence",
    description: "Repository understanding, metadata enrichment, code review, and evidence reports.",
    keywords: ["review", "static", "analysis", "diff", "history", "evidence", "verification"],
  },
  {
    id: "ai-agents",
    label: "AI agents",
    description: "Agents, tool use, workflows, orchestration, RAG, evals, and model integration.",
    keywords: ["ai", "agent", "agents", "llm", "rag", "embedding", "eval", "model", "prompt", "workflow", "inference"],
  },
  {
    id: "search-discovery",
    label: "Search and discovery",
    description: "Search, ranking, recommendations, feeds, semantic retrieval, and discovery UX.",
    keywords: ["search", "discovery", "recommend", "ranking", "semantic", "feed", "index", "retrieval", "similar"],
  },
  {
    id: "ingestion-sync",
    label: "Ingestion and sync",
    description: "External API ingestion, sync jobs, scraping, enrichment, and scheduled updates.",
    keywords: ["sync", "ingest", "ingestion", "scrape", "scraping", "enrich", "crawler", "etl", "scheduled"],
  },
  {
    id: "cloudflare-deploy",
    label: "Cloudflare and deploy",
    description: "Workers, Pages, edge runtime, queues, storage, and deploy automation.",
    keywords: ["cloudflare", "worker", "workers", "pages", "edge", "deploy", "wrangler", "queue", "r2", "d1", "kv"],
  },
  {
    id: "database-storage",
    label: "Database and storage",
    description: "SQL, document storage, migrations, cache, queues, vectors, and persistence.",
    keywords: ["database", "db", "sql", "sqlite", "postgres", "turso", "libsql", "drizzle", "prisma", "migration", "storage", "vector", "cache"],
  },
  {
    id: "ui-workflows",
    label: "UI workflows",
    description: "Dashboards, tables, forms, component systems, charts, and user workflows.",
    keywords: ["ui", "ux", "dashboard", "table", "component", "react", "next", "tailwind", "radix", "chart", "workflow", "form"],
  },
  {
    id: "auth-identity",
    label: "Auth and identity",
    description: "Auth, OAuth, sessions, users, permissions, and account flows.",
    keywords: ["auth", "oauth", "identity", "session", "user", "permission", "login", "nextauth", "jwt"],
  },
  {
    id: "testing-quality",
    label: "Testing and quality",
    description: "Unit tests, browser tests, evals, CI quality gates, and regression checks.",
    keywords: ["test", "testing", "quality", "vitest", "playwright", "ci", "eval", "benchmark", "coverage", "regression"],
  },
  {
    id: "content-media",
    label: "Content and media",
    description: "Content production, video, reels, documents, markdown, and publishing workflows.",
    keywords: ["content", "media", "video", "reel", "markdown", "document", "publish", "editor", "render"],
  },
  {
    id: "game-simulation",
    label: "Game and simulation",
    description: "Game loops, simulations, world state, NPC behavior, physics, and interactive gameplay.",
    keywords: ["game", "simulation", "simulator", "world", "npc", "character", "gameplay", "physics", "rpg", "multiplayer"],
  },
  {
    id: "analytics-intelligence",
    label: "Analytics and intelligence",
    description: "Signal analysis, forecasting, monitoring, trends, metrics, and decision support.",
    keywords: ["analytics", "intelligence", "signal", "forecast", "monitoring", "metric", "trend", "insight", "report"],
  },
  {
    id: "browser-extension",
    label: "Browser and extensions",
    description: "Browser extensions, page capture, annotation, automation, and client-side integrations.",
    keywords: ["browser", "extension", "chrome", "annotation", "capture", "webpage", "reader"],
  },
];

export function inferFeatureAreas(input: {
  description: string;
  statusSummary?: string;
  plannedNext?: string[];
  readmeSummary?: string;
  dependencies?: string[];
}): FleetFeatureArea[] {
  const primaryText = [
    input.description,
    input.statusSummary ?? "",
    ...(input.plannedNext ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const readmeText = (input.readmeSummary ?? "").toLowerCase();
  const stackText = [
    ...(input.dependencies ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const matched = FEATURE_RULES
    .map((rule) => ({
      ...rule,
      primaryScore: rule.keywords.reduce((sum, keyword) => sum + (primaryText.includes(keyword) ? 1 : 0), 0),
      readmeScore: rule.keywords.reduce((sum, keyword) => sum + (readmeText.includes(keyword) ? 1 : 0), 0),
      stackScore: rule.keywords.reduce((sum, keyword) => sum + (stackText.includes(keyword) ? 1 : 0), 0),
    }))
    .filter(
      (rule) =>
        rule.primaryScore > 0 ||
        (rule.readmeScore > 1 && readmeDerivedFeature(rule.id)) ||
        (rule.stackScore > 1 && stackDerivedFeature(rule.id))
    )
    .map((rule) => ({
      ...rule,
      score:
        rule.primaryScore * 5 +
        (readmeDerivedFeature(rule.id) ? rule.readmeScore : 0) +
        (stackDerivedFeature(rule.id) ? Math.min(2, rule.stackScore) : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map(({ score: _score, primaryScore: _primaryScore, readmeScore: _readmeScore, stackScore: _stackScore, ...rule }) => ({ ...rule, source: "inferred" as const }));

  if (matched.length > 0) return matched;

  return [
    {
      id: "project-fit",
      label: "Project fit",
      description: "General libraries and tools that match this project's current product direction.",
      keywords: topTokens(input.description, 8),
      source: "registry",
    },
  ];
}

function stackDerivedFeature(featureId: string): boolean {
  return featureId === "cloudflare-deploy" || featureId === "database-storage" || featureId === "testing-quality" || featureId === "ui-workflows";
}

function readmeDerivedFeature(featureId: string): boolean {
  return [
    "ai-agents",
    "analytics-intelligence",
    "browser-extension",
    "content-media",
    "game-simulation",
    "ingestion-sync",
    "search-discovery",
  ].includes(featureId);
}

export function buildProjectRecommendationReport(
  project: FleetProjectSnapshot,
  candidates: FleetRepoCandidate[],
  options: {
    limit?: number;
    now?: Date;
    semanticDistances?: SemanticDistanceMap;
  } = {}
): FleetProjectRecommendationReport {
  const now = options.now ?? new Date();
  const semanticDistances = options.semanticDistances ?? new Map<string, number>();
  const suppressed = {
    dependencyMatches: 0,
    archived: 0,
    lowSignal: 0,
  };
  const byFeatureCandidates = new Map<string, FleetRecommendation[]>();

  for (const candidate of candidates) {
    if (matchesExistingDependency(project, candidate)) {
      suppressed.dependencyMatches += 1;
      continue;
    }

    const recommendationsForRepo = recommendationsForCandidate(project, candidate, now, semanticDistances);
    if (recommendationsForRepo.length === 0) {
      if (candidate.archived) suppressed.archived += 1;
      else suppressed.lowSignal += 1;
      continue;
    }

    for (const recommendation of recommendationsForRepo) {
      const current = byFeatureCandidates.get(recommendation.featureArea.id) ?? [];
      current.push(recommendation);
      byFeatureCandidates.set(recommendation.featureArea.id, current);
    }
  }

  for (const [featureId, featureRecommendations] of byFeatureCandidates) {
    byFeatureCandidates.set(
      featureId,
      featureRecommendations.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.stargazersCount - a.stargazersCount;
      })
    );
  }

  const recommendations = selectBalancedRecommendations(
    project,
    byFeatureCandidates,
    options.limit ?? 30
  );

  const byFeatureArea = project.featureAreas.map((featureArea) => ({
    featureArea,
    recommendations: recommendations.filter(
      (recommendation) => recommendation.featureArea.id === featureArea.id
    ),
  }));

  const reportWithoutMarkdown = {
    project,
    recommendations,
    byFeatureArea,
    suppressed,
    summary: {
      candidateRepos: candidates.length,
      returned: recommendations.length,
      useNow: recommendations.filter((repo) => repo.action === "use-now").length,
      prototype: recommendations.filter((repo) => repo.action === "prototype").length,
      research: recommendations.filter((repo) => repo.action === "research").length,
      topLanguages: topLanguages(recommendations),
    },
  };

  return {
    ...reportWithoutMarkdown,
    markdown: buildMarkdown(reportWithoutMarkdown),
  };
}

function recommendationsForCandidate(
  project: FleetProjectSnapshot,
  candidate: FleetRepoCandidate,
  now: Date,
  semanticDistances: SemanticDistanceMap
): FleetRecommendation[] {
  return project.featureAreas
    .map((featureArea) => scoreCandidateForFeature(project, featureArea, candidate, now, semanticDistances))
    .filter((recommendation): recommendation is FleetRecommendation => recommendation !== null)
    .sort((a, b) => b.score - a.score);
}

function selectBalancedRecommendations(
  project: FleetProjectSnapshot,
  byFeatureCandidates: Map<string, FleetRecommendation[]>,
  limit: number
): FleetRecommendation[] {
  const selected: FleetRecommendation[] = [];
  const selectedRepoIds = new Set<number>();
  const featureIds = project.featureAreas.map((feature) => feature.id);
  const perFeatureIndexes = new Map(featureIds.map((featureId) => [featureId, 0]));
  const maxPerFeature = Math.max(4, Math.ceil(limit / Math.max(1, featureIds.length)) + 1);

  while (selected.length < limit) {
    let addedThisRound = false;
    for (const featureId of featureIds) {
      const candidates = byFeatureCandidates.get(featureId) ?? [];
      let index = perFeatureIndexes.get(featureId) ?? 0;
      let featureSelectedCount = selected.filter((item) => item.featureArea.id === featureId).length;

      while (index < candidates.length && featureSelectedCount < maxPerFeature) {
        const candidate = candidates[index++];
        if (selectedRepoIds.has(candidate.id)) continue;
        selected.push(candidate);
        selectedRepoIds.add(candidate.id);
        featureSelectedCount += 1;
        addedThisRound = true;
        break;
      }

      perFeatureIndexes.set(featureId, index);
      if (selected.length >= limit) break;
    }
    if (!addedThisRound) break;
  }

  return selected;
}

function broadFeatureNeedsProjectOverlap(featureId: string): boolean {
  return [
    "auth-identity",
    "cloudflare-deploy",
    "content-media",
    "database-storage",
    "game-simulation",
    "ui-workflows",
  ].includes(featureId);
}

function scoreCandidateForFeature(
  project: FleetProjectSnapshot,
  featureArea: FleetFeatureArea,
  candidate: FleetRepoCandidate,
  now: Date,
  semanticDistances: SemanticDistanceMap
): FleetRecommendation | null {
  const candidateText = searchableRepoText(candidate);
  const projectTokens = topTokens(project.contextText, 32);
  const featureTerms = [...featureArea.keywords, ...topTokens(featureArea.label, 4)];
  const matchedFeatureTerms = unique(
    featureTerms.filter((term) => tokenOrPhraseMatch(candidateText, term))
  ).slice(0, 6);
  const strongFeatureTerms = matchedFeatureTerms.filter(
    (term) => !LOW_VALUE_MATCH_TERMS.has(term.toLowerCase())
  );
  const projectOverlap = projectTokens
    .filter((token) => !LOW_VALUE_PROJECT_OVERLAP.has(token))
    .filter((token) => tokenOrPhraseMatch(candidateText, token))
    .slice(0, 8);
  const semanticDistance = semanticDistances.get(semanticKey(candidate.id, featureArea.id)) ?? null;
  const cautions = repoCautions(candidate, now);
  const reasons: string[] = [];

  let score = 0;

  if (matchedFeatureTerms.length > 0) {
    score += Math.min(44, strongFeatureTerms.length * 11 + (matchedFeatureTerms.length - strongFeatureTerms.length) * 3);
    if (strongFeatureTerms.length > 0) {
      reasons.push(`matches ${strongFeatureTerms.slice(0, 3).join(", ")}`);
    }
  }

  if (projectOverlap.length > 0) {
    score += Math.min(24, projectOverlap.length * 4);
    reasons.push(`project overlap: ${projectOverlap.slice(0, 3).join(", ")}`);
  }

  if (semanticDistance !== null) {
    const semanticScore = Math.max(0, Math.round((0.72 - semanticDistance) * 70));
    score += Math.min(32, semanticScore);
    if (semanticScore > 8) reasons.push("embedding match");
  }

  if (strongFeatureTerms.length === 0 && semanticDistance === null && projectOverlap.length < 3) {
    return null;
  }

  if (
    broadFeatureNeedsProjectOverlap(featureArea.id) &&
    semanticDistance === null &&
    (strongFeatureTerms.length === 0 || projectOverlap.length === 0)
  ) {
    return null;
  }

  if (candidate.language && project.stack.languages.includes(candidate.language)) {
    score += 12;
    reasons.push(`${candidate.language} stack fit`);
  } else if (candidate.language && project.contextText.toLowerCase().includes(candidate.language.toLowerCase())) {
    score += 7;
    reasons.push(`${candidate.language} context fit`);
  }

  const aiKeywords = candidate.ai?.keywords ?? [];
  const aiMatches = aiKeywords.filter((keyword) => featureTerms.some((term) => relatedToken(keyword, term)));
  if (aiMatches.length > 0) {
    score += Math.min(18, aiMatches.length * 6);
    reasons.push(`AI metadata: ${aiMatches.slice(0, 2).join(", ")}`);
  }

  score += popularityScore(candidate.stargazersCount);
  score += freshnessScore(candidate.repoUpdatedAt, now);
  if (candidate.isSaved) score += 4;

  if (isCuratedListRepo(candidate)) score -= 18;
  if (candidate.archived) score -= 60;
  if (cautions.some((caution) => caution.includes("quiet"))) score -= 14;
  if (!candidate.description && candidate.topics.length === 0) score -= 12;

  if (score < 35 || reasons.length === 0) return null;

  const roundedScore = Math.round(score);
  return {
    ...candidate,
    featureArea,
    action: actionForScore(roundedScore, cautions),
    score: roundedScore,
    reasons: unique(reasons).slice(0, 5),
    cautions,
    suggestedUse: suggestedUse(featureArea, candidate),
    semanticDistance,
  };
}

export function semanticKey(repoId: number, featureAreaId: string): string {
  return `${repoId}:${featureAreaId}`;
}

export function matchesExistingDependency(
  project: FleetProjectSnapshot,
  candidate: Pick<FleetRepoCandidate, "name" | "fullName" | "topics">
): boolean {
  const dependencyNames = new Set(
    [
      ...project.stack.dependencies,
      ...project.stack.devDependencies,
      ...project.stack.packageNames,
    ].map(normalizePackageLike).filter((name) => name.length > 2)
  );
  const candidateNames = unique([
    candidate.name,
    candidate.fullName,
    candidate.fullName.split("/").pop() ?? "",
    ...candidate.topics,
  ])
    .map(normalizePackageLike)
    .filter((name) => name.length > 2);

  for (const candidateName of candidateNames) {
    if (dependencyNames.has(candidateName)) return true;
    for (const dependencyName of dependencyNames) {
      if (
        dependencyName.length > 4 &&
        candidateName.length > 4 &&
        (dependencyName.includes(candidateName) || candidateName.includes(dependencyName))
      ) {
        return true;
      }
    }
  }

  return false;
}

function searchableRepoText(candidate: FleetRepoCandidate): string {
  return [
    candidate.name,
    candidate.fullName,
    candidate.description ?? "",
    candidate.language ?? "",
    ...candidate.topics,
    candidate.ai?.summary ?? "",
    candidate.ai?.category ?? "",
    ...(candidate.ai?.subcategories ?? []),
    ...(candidate.ai?.useCases ?? []),
    ...(candidate.ai?.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function tokenOrPhraseMatch(text: string, term: string): boolean {
  const normalized = term.toLowerCase().trim();
  if (normalized.length <= 2) return false;
  if (normalized.includes(" ")) return text.includes(normalized);
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`).test(text);
}

function relatedToken(a: string, b: string): boolean {
  const left = normalizePackageLike(a);
  const right = normalizePackageLike(b);
  if (left.length <= 2 || right.length <= 2) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function popularityScore(stargazersCount: number): number {
  if (stargazersCount <= 0) return 0;
  return Math.min(18, Math.log10(stargazersCount + 1) * 4);
}

function freshnessScore(repoUpdatedAt: string | null, now: Date): number {
  const ageDays = daysSince(repoUpdatedAt, now);
  if (ageDays === null) return 0;
  if (ageDays <= 30) return 16;
  if (ageDays <= 180) return 11;
  if (ageDays <= 365) return 6;
  return 0;
}

function repoCautions(candidate: FleetRepoCandidate, now: Date): string[] {
  const cautions: string[] = [];
  const ageDays = daysSince(candidate.repoUpdatedAt, now);
  if (isCuratedListRepo(candidate)) cautions.push("curated list, not an implementation");
  if (candidate.archived) cautions.push("archived");
  if (ageDays !== null && ageDays > 365) cautions.push("quiet for 12 months");
  if (!candidate.description && candidate.topics.length === 0) cautions.push("sparse metadata");
  return cautions;
}

function isCuratedListRepo(candidate: FleetRepoCandidate): boolean {
  const text = [
    candidate.name,
    candidate.fullName,
    candidate.description ?? "",
    ...candidate.topics,
  ]
    .join(" ")
    .toLowerCase();
  return /\bawesome[-\s]/.test(text) || text.includes("awesome-list");
}

function actionForScore(score: number, cautions: string[]): FleetRecommendationAction {
  if (cautions.includes("archived")) return "skip";
  if (score >= 82 && cautions.length === 0) return "use-now";
  if (score >= 62) return "prototype";
  if (score >= 42) return "research";
  return "skip";
}

function suggestedUse(featureArea: FleetFeatureArea, candidate: FleetRepoCandidate): string {
  const subject = candidate.description
    ? candidate.description.replace(/\.$/, "")
    : `${candidate.fullName} capabilities`;
  return `Use for ${featureArea.label.toLowerCase()}: ${subject}.`;
}

function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

function topLanguages(recommendations: FleetRecommendation[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const recommendation of recommendations) {
    if (!recommendation.language) continue;
    counts.set(recommendation.language, (counts.get(recommendation.language) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
}

export function topTokens(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []) {
    const normalized = normalizePackageLike(token);
    if (normalized.length < 3 || GENERIC_TOKENS.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function normalizePackageLike(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\/.*$/, (match) => match.replace("/", "-"))
    .replace(/[^a-z0-9+#.-]+/g, "-")
    .replace(/\.js$/, "")
    .replace(/-js$/, "")
    .replace(/^-+|-+$/g, "");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMarkdown(report: Omit<FleetProjectRecommendationReport, "markdown">): string {
  const lines = [
    `# ${report.project.name} recommendations`,
    "",
    `Generated from ${report.summary.candidateRepos} Starboard repositories.`,
    "",
  ];

  for (const recommendation of report.recommendations) {
    lines.push(`## ${recommendation.fullName}`);
    lines.push(`- Action: ${recommendation.action}`);
    lines.push(`- Feature area: ${recommendation.featureArea.label}`);
    lines.push(`- Score: ${recommendation.score}`);
    lines.push(`- Why: ${recommendation.reasons.join("; ")}`);
    lines.push(`- Use: ${recommendation.suggestedUse}`);
    if (recommendation.cautions.length > 0) {
      lines.push(`- Cautions: ${recommendation.cautions.join("; ")}`);
    }
    lines.push(`- URL: ${recommendation.htmlUrl}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
