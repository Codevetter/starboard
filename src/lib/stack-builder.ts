export type StackGoal = "web-app" | "ai-app" | "api-service" | "mobile-app";

export type StackRoleId =
  | "framework"
  | "ui"
  | "database"
  | "auth"
  | "deployment"
  | "testing"
  | "observability"
  | "ai";

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
  warnings: string[];
  compatibilityNotes: string[];
}

export interface StackRole {
  id: StackRoleId;
  label: string;
  summary: string;
  selected: StackCandidate | null;
  alternatives: StackCandidate[];
  conflicts: string[];
}

export interface StackBuilderReport {
  goal: StackGoal;
  goalLabel: string;
  roles: StackRole[];
  markdown: string;
  selectedRepoIds: number[];
  summary: {
    totalRepos: number;
    coveredRoles: number;
    warningCount: number;
    topLanguages: [string, number][];
  };
}

interface RoleDefinition {
  id: StackRoleId;
  label: string;
  summary: string;
  keywords: string[];
  languages: string[];
}

interface GoalDefinition {
  label: string;
  preferredRoles: StackRoleId[];
  keywords: string[];
}

const roleDefinitions: RoleDefinition[] = [
  {
    id: "framework",
    label: "Framework",
    summary: "Primary application framework or runtime.",
    keywords: ["framework", "next", "react", "vue", "svelte", "astro", "hono", "express", "fastify", "nestjs", "django", "rails", "expo", "flutter"],
    languages: ["TypeScript", "JavaScript", "Python", "Ruby", "Dart", "Swift", "Kotlin"],
  },
  {
    id: "ui",
    label: "UI",
    summary: "Components, styling, icons, and design-system pieces.",
    keywords: ["ui", "component", "components", "tailwind", "css", "design-system", "radix", "shadcn", "storybook", "icons"],
    languages: ["TypeScript", "JavaScript", "Vue", "Svelte", "CSS", "HTML"],
  },
  {
    id: "database",
    label: "Database",
    summary: "Database, ORM, migrations, search, cache, or vector storage.",
    keywords: ["database", "db", "sql", "postgres", "sqlite", "mysql", "redis", "turso", "drizzle", "prisma", "orm", "migration", "search", "vector"],
    languages: ["SQL", "PLpgSQL", "TypeScript", "Go", "Rust"],
  },
  {
    id: "auth",
    label: "Auth",
    summary: "Authentication, authorization, OAuth, sessions, and identity.",
    keywords: ["auth", "authentication", "authorization", "oauth", "openid", "session", "jwt", "nextauth", "better-auth", "clerk", "supabase"],
    languages: ["TypeScript", "JavaScript", "Go", "Python", "Rust"],
  },
  {
    id: "deployment",
    label: "Deployment",
    summary: "Hosting, workers, containers, infrastructure, and release automation.",
    keywords: ["deploy", "deployment", "cloud", "docker", "kubernetes", "terraform", "worker", "workers", "vercel", "cloudflare", "ci", "github-actions"],
    languages: ["Go", "TypeScript", "Shell", "HCL", "Dockerfile", "Rust"],
  },
  {
    id: "testing",
    label: "Testing",
    summary: "Unit, integration, browser, and quality automation.",
    keywords: ["test", "testing", "vitest", "jest", "playwright", "cypress", "mock", "e2e", "qa", "coverage"],
    languages: ["TypeScript", "JavaScript", "Python"],
  },
  {
    id: "observability",
    label: "Observability",
    summary: "Logs, metrics, tracing, analytics, monitoring, and error reporting.",
    keywords: ["observability", "monitoring", "analytics", "logs", "logging", "metrics", "tracing", "opentelemetry", "sentry", "prometheus"],
    languages: ["TypeScript", "JavaScript", "Go", "Python", "Rust"],
  },
  {
    id: "ai",
    label: "AI",
    summary: "LLM tooling, embeddings, agents, evals, and model integration.",
    keywords: ["ai", "llm", "openai", "anthropic", "agent", "agents", "embedding", "vector", "rag", "eval", "inference", "model"],
    languages: ["Python", "TypeScript", "Jupyter Notebook", "Rust"],
  },
];

const goalDefinitions: Record<StackGoal, GoalDefinition> = {
  "web-app": {
    label: "Web app",
    preferredRoles: ["framework", "ui", "database", "auth", "deployment", "testing", "observability"],
    keywords: ["web", "frontend", "fullstack", "app", "react", "next"],
  },
  "ai-app": {
    label: "AI app",
    preferredRoles: ["framework", "ai", "database", "auth", "deployment", "testing", "observability", "ui"],
    keywords: ["ai", "llm", "agent", "rag", "embedding", "vector"],
  },
  "api-service": {
    label: "API service",
    preferredRoles: ["framework", "database", "auth", "deployment", "testing", "observability"],
    keywords: ["api", "backend", "server", "service", "worker"],
  },
  "mobile-app": {
    label: "Mobile app",
    preferredRoles: ["framework", "ui", "auth", "database", "deployment", "testing", "observability"],
    keywords: ["mobile", "ios", "android", "expo", "react-native", "flutter"],
  },
};

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

function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function freshnessScore(repoUpdatedAt: string | null, now: Date): number {
  const ageDays = daysSince(repoUpdatedAt, now);
  if (ageDays === null) return 0;
  if (ageDays <= 30) return 18;
  if (ageDays <= 180) return 12;
  if (ageDays <= 365) return 6;
  return 0;
}

function popularityScore(stargazersCount: number): number {
  if (stargazersCount <= 0) return 0;
  return Math.min(20, Math.log10(stargazersCount + 1) * 5);
}

function repoWarnings(repo: StackRepoInput, now: Date): string[] {
  const warnings: string[] = [];
  const ageDays = daysSince(repo.repoUpdatedAt, now);
  if (repo.archived) warnings.push("Archived repository");
  if (ageDays !== null && ageDays >= 365) warnings.push("No release activity in 12 months");
  if (!repo.description && repo.topics.length === 0) warnings.push("Sparse metadata");
  return warnings;
}

function compatibilityNotes(
  repo: StackRepoInput,
  role: RoleDefinition,
  goal: GoalDefinition
): string[] {
  const notes: string[] = [];
  const text = searchableText(repo);
  const goalMatches = goal.keywords.filter((keyword) => text.includes(keyword));

  if (goal.preferredRoles.includes(role.id)) {
    notes.push(`Fits the ${goal.label.toLowerCase()} goal`);
  }
  if (repo.language) {
    notes.push(`${repo.language} ecosystem`);
  }
  if (goalMatches.length > 0) {
    notes.push(`Goal signal: ${goalMatches.slice(0, 2).join(", ")}`);
  }

  return notes.slice(0, 3);
}

function scoreRepoForRole(
  repo: StackRepoInput,
  role: RoleDefinition,
  goal: GoalDefinition,
  now: Date
): StackCandidate | null {
  const text = searchableText(repo);
  const reasons: string[] = [];
  const warnings = repoWarnings(repo, now);
  let score = popularityScore(repo.stargazersCount) + freshnessScore(repo.repoUpdatedAt, now);

  if (repo.language && role.languages.includes(repo.language)) {
    score += 18;
    reasons.push(`${repo.language} fit`);
  }

  const repoTopics = new Set(repo.topics.map(normalize));
  const matchedKeywords = role.keywords.filter((keyword) => {
    const normalizedKeyword = normalize(keyword);
    return repoTopics.has(normalizedKeyword) || text.includes(normalizedKeyword);
  });

  if (matchedKeywords.length > 0) {
    score += Math.min(45, matchedKeywords.length * 12);
    reasons.push(
      matchedKeywords.slice(0, 3).map((keyword) => `#${keyword}`).join(", ")
    );
  }

  const goalMatches = goal.keywords.filter((keyword) => text.includes(keyword));
  if (goal.preferredRoles.includes(role.id)) score += 8;
  if (goalMatches.length > 0) {
    score += Math.min(16, goalMatches.length * 5);
    reasons.push(`goal: ${goalMatches.slice(0, 2).join(", ")}`);
  }

  if (repo.archived) score -= 30;
  if (warnings.some((warning) => warning.includes("12 months"))) score -= 10;

  if (score < 28 || reasons.length === 0) return null;

  return {
    ...repo,
    score: Math.round(score),
    reasons,
    warnings,
    compatibilityNotes: compatibilityNotes(repo, role, goal),
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

function roleConflicts(candidates: StackCandidate[]): string[] {
  if (candidates.length < 2) return [];
  const top = candidates[0];
  const closeAlternatives = candidates
    .slice(1)
    .filter((candidate) => top.score - candidate.score <= 8)
    .map((candidate) => candidate.fullName);

  if (closeAlternatives.length === 0) return [];
  return [`Choose one primary: ${[top.fullName, ...closeAlternatives].join(" vs ")}`];
}

function buildMarkdown(report: Omit<StackBuilderReport, "markdown">): string {
  const lines = [
    `# ${report.goalLabel} stack`,
    "",
    `Generated from ${report.summary.totalRepos} starred repositories.`,
    "",
  ];

  for (const role of report.roles) {
    lines.push(`## ${role.label}`);
    if (!role.selected) {
      lines.push("- No strong match found.");
      lines.push("");
      continue;
    }

    lines.push(`- Pick: [${role.selected.fullName}](${role.selected.htmlUrl})`);
    lines.push(`- Why: ${role.selected.reasons.join("; ")}`);
    if (role.selected.compatibilityNotes.length > 0) {
      lines.push(`- Compatibility: ${role.selected.compatibilityNotes.join("; ")}`);
    }
    if (role.selected.warnings.length > 0) {
      lines.push(`- Warnings: ${role.selected.warnings.join("; ")}`);
    }
    if (role.alternatives.length > 0) {
      lines.push(`- Alternatives: ${role.alternatives.map((repo) => repo.fullName).join(", ")}`);
    }
    if (role.conflicts.length > 0) {
      lines.push(`- Conflicts: ${role.conflicts.join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function parseStackGoal(value: string | null | undefined): StackGoal {
  return value === "ai-app" || value === "api-service" || value === "mobile-app"
    ? value
    : "web-app";
}

export function buildStackBuilderReport(
  repos: StackRepoInput[],
  options: { goal?: StackGoal; now?: Date } = {}
): StackBuilderReport {
  const goal = options.goal ?? "web-app";
  const goalDefinition = goalDefinitions[goal];
  const now = options.now ?? new Date();
  const orderedRoles = [
    ...goalDefinition.preferredRoles,
    ...roleDefinitions
      .map((role) => role.id)
      .filter((roleId) => !goalDefinition.preferredRoles.includes(roleId)),
  ];

  const roles = orderedRoles.map((roleId) => {
    const role = roleDefinitions.find((definition) => definition.id === roleId)!;
    const candidates = repos
      .map((repo) => scoreRepoForRole(repo, role, goalDefinition, now))
      .filter((repo): repo is StackCandidate => repo !== null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.stargazersCount - a.stargazersCount;
      })
      .slice(0, 4);

    return {
      id: role.id,
      label: role.label,
      summary: role.summary,
      selected: candidates[0] ?? null,
      alternatives: candidates.slice(1),
      conflicts: roleConflicts(candidates),
    };
  });

  const selectedRepoIds = [
    ...new Set(roles.flatMap((role) => (role.selected ? [role.selected.id] : []))),
  ];
  const reportWithoutMarkdown = {
    goal,
    goalLabel: goalDefinition.label,
    roles,
    selectedRepoIds,
    summary: {
      totalRepos: repos.length,
      coveredRoles: roles.filter((role) => role.selected !== null).length,
      warningCount: roles.reduce((sum, role) => sum + (role.selected?.warnings.length ?? 0), 0),
      topLanguages: topLanguages(repos),
    },
  };

  return {
    ...reportWithoutMarkdown,
    markdown: buildMarkdown(reportWithoutMarkdown),
  };
}
