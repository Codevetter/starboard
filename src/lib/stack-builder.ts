export type StackLaneId =
  | "frontend"
  | "backend"
  | "database"
  | "ai"
  | "infrastructure"
  | "testing"
  | "tooling"
  | "mobile";

export interface StackRepoInput {
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
}

export interface StackCandidate extends StackRepoInput {
  score: number;
  reasons: string[];
}

export interface StackLane {
  id: StackLaneId;
  label: string;
  summary: string;
  selected: StackCandidate | null;
  alternatives: StackCandidate[];
}

export interface StackBuilderReport {
  lanes: StackLane[];
  summary: {
    totalRepos: number;
    coveredLanes: number;
    archivedCandidates: number;
    topLanguages: [string, number][];
  };
}

interface LaneDefinition {
  id: StackLaneId;
  label: string;
  summary: string;
  keywords: string[];
  languages: string[];
}

const laneDefinitions: LaneDefinition[] = [
  {
    id: "frontend",
    label: "Frontend",
    summary: "UI frameworks, component systems, styling, and client-side app foundations.",
    keywords: ["frontend", "react", "next", "vue", "svelte", "solid", "astro", "tailwind", "css", "ui", "component", "design-system"],
    languages: ["TypeScript", "JavaScript", "Vue", "Svelte", "CSS", "HTML"],
  },
  {
    id: "backend",
    label: "Backend",
    summary: "API runtimes, server frameworks, queues, and service foundations.",
    keywords: ["backend", "api", "server", "hono", "express", "fastify", "nestjs", "django", "rails", "worker", "queue", "rpc", "graphql"],
    languages: ["TypeScript", "JavaScript", "Go", "Rust", "Python", "Ruby", "Java", "Kotlin", "C#"],
  },
  {
    id: "database",
    label: "Database",
    summary: "Storage engines, ORMs, migrations, cache, search, and data access layers.",
    keywords: ["database", "db", "sql", "postgres", "sqlite", "mysql", "redis", "turso", "drizzle", "prisma", "orm", "migration", "search", "vector"],
    languages: ["SQL", "PLpgSQL", "TypeScript", "Go", "Rust"],
  },
  {
    id: "ai",
    label: "AI",
    summary: "LLM tooling, embeddings, agents, evals, and model integration pieces.",
    keywords: ["ai", "llm", "openai", "anthropic", "agent", "agents", "embedding", "vector", "rag", "eval", "inference", "model"],
    languages: ["Python", "TypeScript", "Jupyter Notebook", "Rust"],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    summary: "Cloud, deployment, observability, auth, automation, and platform operations.",
    keywords: ["cloud", "deploy", "docker", "kubernetes", "terraform", "worker", "vercel", "cloudflare", "auth", "oauth", "observability", "monitoring", "ci"],
    languages: ["Go", "TypeScript", "Shell", "HCL", "Dockerfile", "Rust"],
  },
  {
    id: "testing",
    label: "Testing",
    summary: "Unit, integration, end-to-end, browser, and quality automation.",
    keywords: ["test", "testing", "vitest", "jest", "playwright", "cypress", "storybook", "mock", "e2e", "qa"],
    languages: ["TypeScript", "JavaScript", "Python"],
  },
  {
    id: "tooling",
    label: "Tooling",
    summary: "Build systems, CLIs, developer workflow, package management, and code quality.",
    keywords: ["cli", "tool", "tooling", "build", "bundle", "bundler", "vite", "webpack", "eslint", "prettier", "typescript", "package"],
    languages: ["TypeScript", "JavaScript", "Rust", "Go", "Shell"],
  },
  {
    id: "mobile",
    label: "Mobile",
    summary: "Native and cross-platform mobile app foundations.",
    keywords: ["mobile", "ios", "android", "react-native", "expo", "flutter", "swift", "kotlin"],
    languages: ["Swift", "Kotlin", "Dart", "TypeScript", "Java"],
  },
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function searchableText(repo: StackRepoInput): string {
  return [
    repo.name,
    repo.fullName,
    repo.description ?? "",
    repo.language ?? "",
    ...repo.topics,
  ].join(" ").toLowerCase();
}

function freshnessScore(repoUpdatedAt: string | null, now: Date): number {
  if (!repoUpdatedAt) return 0;
  const updatedAt = new Date(repoUpdatedAt);
  if (Number.isNaN(updatedAt.getTime())) return 0;

  const ageDays = Math.max(0, (now.getTime() - updatedAt.getTime()) / 86_400_000);
  if (ageDays <= 30) return 18;
  if (ageDays <= 180) return 12;
  if (ageDays <= 365) return 6;
  return 0;
}

function popularityScore(stargazersCount: number): number {
  if (stargazersCount <= 0) return 0;
  return Math.min(20, Math.log10(stargazersCount + 1) * 5);
}

function scoreRepoForLane(
  repo: StackRepoInput,
  lane: LaneDefinition,
  now: Date
): StackCandidate | null {
  const text = searchableText(repo);
  const reasons: string[] = [];
  let score = popularityScore(repo.stargazersCount) + freshnessScore(repo.repoUpdatedAt, now);

  if (repo.language && lane.languages.includes(repo.language)) {
    score += 20;
    reasons.push(`${repo.language} fit`);
  }

  const repoTopics = new Set(repo.topics.map(normalize));
  const matchedKeywords = lane.keywords.filter((keyword) => {
    const normalizedKeyword = normalize(keyword);
    return repoTopics.has(normalizedKeyword) || text.includes(normalizedKeyword);
  });

  if (matchedKeywords.length > 0) {
    score += Math.min(45, matchedKeywords.length * 12);
    reasons.push(
      matchedKeywords.slice(0, 3).map((keyword) => `#${keyword}`).join(", ")
    );
  }

  if (repo.archived) {
    score -= 30;
    reasons.push("archived");
  }

  if (score < 30 || reasons.length === 0) return null;

  return {
    ...repo,
    score: Math.round(score),
    reasons,
  };
}

function topLanguages(repos: StackRepoInput[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    if (!repo.language) continue;
    counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
}

export function buildStackBuilderReport(
  repos: StackRepoInput[],
  now = new Date()
): StackBuilderReport {
  const lanes = laneDefinitions.map((lane) => {
    const candidates = repos
      .map((repo) => scoreRepoForLane(repo, lane, now))
      .filter((repo): repo is StackCandidate => repo !== null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.stargazersCount - a.stargazersCount;
      })
      .slice(0, 4);

    return {
      id: lane.id,
      label: lane.label,
      summary: lane.summary,
      selected: candidates[0] ?? null,
      alternatives: candidates.slice(1),
    };
  });

  return {
    lanes,
    summary: {
      totalRepos: repos.length,
      coveredLanes: lanes.filter((lane) => lane.selected !== null).length,
      archivedCandidates: lanes.filter((lane) => lane.selected?.archived).length,
      topLanguages: topLanguages(repos),
    },
  };
}
