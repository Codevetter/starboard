export interface ProjectToolSignal {
  key: string;
  name: string;
  category: string;
  confidence: number;
}

export interface ProjectRecommendationRepo {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  archived: boolean;
  topics: string[];
  aiSummary?: string | null;
  aiCategory?: string | null;
  aiKeywords?: string[];
  tools: ProjectToolSignal[];
}

export interface ProjectRecommendation extends ProjectRecommendationRepo {
  score: number;
  evidence: string[];
}

interface ToolRecommendationSource {
  repoId: number;
  fullName: string;
  htmlUrl: string;
  confidence: number;
}

export interface GroundedToolRecommendation {
  key: string;
  name: string;
  category: string;
  score: number;
  supportCount: number;
  sources: ToolRecommendationSource[];
}

export interface ProjectRecommendationResult {
  similarProjects: ProjectRecommendation[];
  recommendedTools: GroundedToolRecommendation[];
  fallback: boolean;
  context: {
    language: string | null;
    topics: string[];
    tools: ProjectToolSignal[];
  };
}

const GENERIC_TOKENS = new Set([
  'and',
  'app',
  'application',
  'build',
  'code',
  'for',
  'from',
  'github',
  'open',
  'project',
  'repo',
  'repository',
  'software',
  'that',
  'the',
  'this',
  'tool',
  'tools',
  'use',
  'using',
  'with',
]);

const MIN_SPECIFIC_PEER_SCORE = 12;
const MIN_GROUNDED_TOOL_CONFIDENCE = 65;
const MIN_GROUNDED_TOOL_SUPPORT = 2;
const COMPETING_TOOL_CATEGORIES = new Set(['framework', 'package-manager']);

function normalizedSet(values: Array<string | null | undefined>): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    const normalized = value?.trim().toLowerCase();
    if (normalized) result.add(normalized);
  }
  return result;
}

function meaningfulTokens(...values: Array<string | null | undefined>): Set<string> {
  return new Set(
    values
      .join(' ')
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9+#.-]{2,}/g)
      ?.filter((token) => !GENERIC_TOKENS.has(token)) ?? []
  );
}

function intersection<T>(left: Set<T>, right: Set<T>, limit = Number.POSITIVE_INFINITY): T[] {
  const result: T[] = [];
  for (const value of left) {
    if (!right.has(value)) continue;
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function recommendToolsFromPeers(
  project: ProjectRecommendationRepo,
  peers: ProjectRecommendation[],
  fallback: boolean,
  limit = 12
): GroundedToolRecommendation[] {
  if (fallback) return [];

  const existingToolKeys = normalizedSet(project.tools.map((tool) => tool.key));
  const existingToolCategories = normalizedSet(project.tools.map((tool) => tool.category));
  const recommendations = new Map<string, GroundedToolRecommendation>();

  for (const peer of peers) {
    for (const tool of peer.tools) {
      const key = tool.key.trim().toLowerCase();
      const category = tool.category.trim().toLowerCase();
      if (
        !key ||
        existingToolKeys.has(key) ||
        category === 'language' ||
        tool.confidence < MIN_GROUNDED_TOOL_CONFIDENCE ||
        (COMPETING_TOOL_CATEGORIES.has(category) && existingToolCategories.has(category))
      ) {
        continue;
      }

      const current = recommendations.get(key) ?? {
        key: tool.key,
        name: tool.name,
        category: tool.category,
        score: 0,
        supportCount: 0,
        sources: [],
      };
      if (current.sources.some((source) => source.repoId === peer.id)) continue;

      current.score += peer.score + Math.max(0, Math.min(tool.confidence, 100)) / 10;
      current.supportCount += 1;
      current.sources.push({
        repoId: peer.id,
        fullName: peer.fullName,
        htmlUrl: peer.htmlUrl,
        confidence: tool.confidence,
      });
      recommendations.set(key, current);
    }
  }

  return [...recommendations.values()]
    .filter((tool) => tool.supportCount >= MIN_GROUNDED_TOOL_SUPPORT)
    .sort(
      (a, b) => b.supportCount - a.supportCount || b.score - a.score || a.name.localeCompare(b.name)
    )
    .slice(0, Math.max(1, Math.min(limit, 24)));
}

export function rankProjectRecommendations(
  project: ProjectRecommendationRepo,
  candidates: ProjectRecommendationRepo[],
  limit = 24
): ProjectRecommendationResult {
  const projectTopics = normalizedSet(project.topics);
  const projectToolKeys = normalizedSet(project.tools.map((tool) => tool.key));
  const projectToolCategories = normalizedSet(project.tools.map((tool) => tool.category));
  const projectLanguage = project.language?.toLowerCase() ?? null;
  const projectTokens = meaningfulTokens(
    project.name,
    project.description,
    project.aiSummary,
    project.aiCategory,
    ...(project.aiKeywords ?? [])
  );

  let hasSpecificMatches = false;
  const scored: Array<ProjectRecommendation & { specificScore: number }> = [];
  for (const candidate of candidates) {
    if (candidate.id === project.id || candidate.archived) continue;

    let score = 0;
    let specificScore = 0;
    const evidence: string[] = [];

    if (
      projectLanguage &&
      candidate.language &&
      projectLanguage === candidate.language.toLowerCase()
    ) {
      score += 6;
      evidence.push(`Same primary language: ${project.language}`);
    }

    const topicMatches = intersection(projectTopics, normalizedSet(candidate.topics), 3);
    if (topicMatches.length > 0) {
      const value = topicMatches.length * 12;
      score += value;
      specificScore += value;
      evidence.push(`Shared topics: ${topicMatches.join(', ')}`);
    }

    const candidateToolKeys = new Set<string>();
    const candidateToolCategories = new Set<string>();
    const candidateToolNames = new Map<string, string>();
    for (const tool of candidate.tools) {
      const key = tool.key.trim().toLowerCase();
      const category = tool.category.trim().toLowerCase();
      if (key) {
        candidateToolKeys.add(key);
        if (!candidateToolNames.has(key)) candidateToolNames.set(key, tool.name);
      }
      if (category) candidateToolCategories.add(category);
    }
    const toolMatches = intersection(projectToolKeys, candidateToolKeys, 2);
    if (toolMatches.length > 0) {
      const value = toolMatches.length * 14;
      score += value;
      specificScore += value;
      const names = toolMatches.map((key) => candidateToolNames.get(key) ?? key);
      evidence.push(`Shared tools: ${names.join(', ')}`);
    }

    const categoryMatches = intersection(projectToolCategories, candidateToolCategories)
      .filter((category) => !toolMatches.includes(category))
      .slice(0, 2);
    if (categoryMatches.length > 0) {
      const value = categoryMatches.length * 6;
      score += value;
      specificScore += value;
      evidence.push(`Related tool areas: ${categoryMatches.join(', ')}`);
    }

    const tokenMatches = intersection(
      projectTokens,
      meaningfulTokens(
        candidate.name,
        candidate.description,
        candidate.aiSummary,
        candidate.aiCategory,
        ...(candidate.aiKeywords ?? [])
      ),
      6
    );
    if (tokenMatches.length > 0) {
      const value = tokenMatches.length * 3;
      score += value;
      specificScore += value;
      evidence.push(`Related context: ${tokenMatches.join(', ')}`);
    }

    const scoredCandidate = { ...candidate, score, specificScore, evidence };
    if (specificScore >= MIN_SPECIFIC_PEER_SCORE) {
      if (!hasSpecificMatches) {
        scored.length = 0;
        hasSpecificMatches = true;
      }
      scored.push(scoredCandidate);
    } else if (!hasSpecificMatches) {
      scored.push(scoredCandidate);
    }
  }

  const similarProjects = scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.stargazersCount - a.stargazersCount ||
        a.fullName.localeCompare(b.fullName)
    )
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((candidate) =>
      hasSpecificMatches
        ? candidate
        : { ...candidate, evidence: ['Broad discovery fallback from the public catalog'] }
    );

  return {
    similarProjects,
    recommendedTools: recommendToolsFromPeers(project, similarProjects, !hasSpecificMatches),
    fallback: !hasSpecificMatches,
    context: {
      language: project.language,
      topics: project.topics,
      tools: project.tools,
    },
  };
}
