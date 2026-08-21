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

interface ScoredProjectCandidate {
  candidate: ProjectRecommendationRepo;
  score: number;
  specificScore: number;
  evidence: string[];
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

function compareScoredCandidates(a: ScoredProjectCandidate, b: ScoredProjectCandidate): number {
  return (
    b.score - a.score ||
    b.candidate.stargazersCount - a.candidate.stargazersCount ||
    a.candidate.fullName.localeCompare(b.candidate.fullName)
  );
}

function retainBoundedCandidate(
  ranked: ScoredProjectCandidate[],
  candidate: ScoredProjectCandidate,
  limit: number
): void {
  if (ranked.length < limit) {
    ranked.push(candidate);
    for (let index = ranked.length - 1; index > 0; ) {
      const parent = Math.floor((index - 1) / 2);
      if (compareScoredCandidates(ranked[index], ranked[parent]) <= 0) break;
      [ranked[index], ranked[parent]] = [ranked[parent], ranked[index]];
      index = parent;
    }
    return;
  }
  if (compareScoredCandidates(candidate, ranked[0]) >= 0) return;
  ranked[0] = candidate;
  for (let index = 0; ; ) {
    const left = index * 2 + 1;
    if (left >= ranked.length) break;
    const right = left + 1;
    let worst = left;
    if (right < ranked.length && compareScoredCandidates(ranked[right], ranked[left]) > 0) {
      worst = right;
    }
    if (compareScoredCandidates(ranked[worst], ranked[index]) <= 0) break;
    [ranked[index], ranked[worst]] = [ranked[worst], ranked[index]];
    index = worst;
  }
}

function canRetainCandidate(
  ranked: ScoredProjectCandidate[],
  candidate: ProjectRecommendationRepo,
  score: number,
  limit: number
): boolean {
  if (ranked.length < limit) return true;
  return (
    score > ranked[0].score ||
    (score === ranked[0].score &&
      (candidate.stargazersCount > ranked[0].candidate.stargazersCount ||
        (candidate.stargazersCount === ranked[0].candidate.stargazersCount &&
          candidate.fullName.localeCompare(ranked[0].candidate.fullName) < 0)))
  );
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

interface CandidateScore {
  score: number;
  specificScore: number;
  languageMatch: boolean;
  topicMatches: string[];
  toolMatches: string[];
  categoryMatches: string[];
  tokenMatches: string[];
}

interface ScoreCandidateContext {
  projectTopics: Set<string>;
  projectToolKeys: Set<string>;
  projectToolCategories: Set<string>;
  projectLanguage: string | null;
  projectTokens: Set<string>;
}

function extractCandidateTools(candidate: ProjectRecommendationRepo): {
  keys: Set<string>;
  categories: Set<string>;
} {
  const keys = new Set<string>();
  const categories = new Set<string>();
  for (const tool of candidate.tools) {
    const key = tool.key.trim().toLowerCase();
    const category = tool.category.trim().toLowerCase();
    if (key) keys.add(key);
    if (category) categories.add(category);
  }
  return { keys, categories };
}

function scoreLanguageAndTopics(
  candidate: ProjectRecommendationRepo,
  ctx: ScoreCandidateContext
): { score: number; specificScore: number; languageMatch: boolean; topicMatches: string[] } {
  let score = 0;
  let specificScore = 0;
  let languageMatch = false;

  if (
    ctx.projectLanguage &&
    candidate.language &&
    ctx.projectLanguage === candidate.language.toLowerCase()
  ) {
    score += 6;
    languageMatch = true;
  }

  const topicMatches = intersection(ctx.projectTopics, normalizedSet(candidate.topics), 3);
  if (topicMatches.length > 0) {
    const value = topicMatches.length * 12;
    score += value;
    specificScore += value;
  }

  return { score, specificScore, languageMatch, topicMatches };
}

function scoreToolsAndCategories(
  ctx: ScoreCandidateContext,
  candidateTools: { keys: Set<string>; categories: Set<string> }
): { score: number; specificScore: number; toolMatches: string[]; categoryMatches: string[] } {
  let score = 0;
  let specificScore = 0;

  const toolMatches = intersection(ctx.projectToolKeys, candidateTools.keys, 2);
  if (toolMatches.length > 0) {
    const value = toolMatches.length * 14;
    score += value;
    specificScore += value;
  }

  const categoryMatches = intersection(ctx.projectToolCategories, candidateTools.categories)
    .filter((category) => !toolMatches.includes(category))
    .slice(0, 2);
  if (categoryMatches.length > 0) {
    const value = categoryMatches.length * 6;
    score += value;
    specificScore += value;
  }

  return { score, specificScore, toolMatches, categoryMatches };
}

function scoreCandidate(
  _project: ProjectRecommendationRepo,
  candidate: ProjectRecommendationRepo,
  ctx: ScoreCandidateContext
): CandidateScore {
  const langTopic = scoreLanguageAndTopics(candidate, ctx);
  const candidateTools = extractCandidateTools(candidate);
  const toolCat = scoreToolsAndCategories(ctx, candidateTools);

  const tokenMatches = intersection(
    ctx.projectTokens,
    meaningfulTokens(
      candidate.name,
      candidate.description,
      candidate.aiSummary,
      candidate.aiCategory,
      ...(candidate.aiKeywords ?? [])
    ),
    6
  );
  let tokenScore = 0;
  let tokenSpecific = 0;
  if (tokenMatches.length > 0) {
    const value = tokenMatches.length * 3;
    tokenScore = value;
    tokenSpecific = value;
  }

  return {
    score: langTopic.score + toolCat.score + tokenScore,
    specificScore: langTopic.specificScore + toolCat.specificScore + tokenSpecific,
    languageMatch: langTopic.languageMatch,
    topicMatches: langTopic.topicMatches,
    toolMatches: toolCat.toolMatches,
    categoryMatches: toolCat.categoryMatches,
    tokenMatches,
  };
}

function buildEvidence(
  project: ProjectRecommendationRepo,
  candidate: ProjectRecommendationRepo,
  scored: CandidateScore
): string[] {
  const evidence: string[] = [];
  if (scored.languageMatch) evidence.push(`Same primary language: ${project.language}`);
  if (scored.topicMatches.length > 0)
    evidence.push(`Shared topics: ${scored.topicMatches.join(', ')}`);
  if (scored.toolMatches.length > 0) {
    const names = scored.toolMatches.map(
      (key) => candidate.tools.find((tool) => tool.key.trim().toLowerCase() === key)?.name ?? key
    );
    evidence.push(`Shared tools: ${names.join(', ')}`);
  }
  if (scored.categoryMatches.length > 0) {
    evidence.push(`Related tool areas: ${scored.categoryMatches.join(', ')}`);
  }
  if (scored.tokenMatches.length > 0)
    evidence.push(`Related context: ${scored.tokenMatches.join(', ')}`);
  return evidence;
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
  const resultLimit = Math.max(1, Math.min(limit, 50));

  let hasSpecificMatches = false;
  const specificCandidates: ScoredProjectCandidate[] = [];
  const fallbackCandidates: ScoredProjectCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.id === project.id || candidate.archived) continue;

    const scored = scoreCandidate(project, candidate, {
      projectTopics,
      projectToolKeys,
      projectToolCategories,
      projectLanguage,
      projectTokens,
    });
    const { score, specificScore } = scored;

    let target: ScoredProjectCandidate[] | null = null;
    if (specificScore >= MIN_SPECIFIC_PEER_SCORE) {
      if (!hasSpecificMatches) {
        fallbackCandidates.length = 0;
        hasSpecificMatches = true;
      }
      target = specificCandidates;
    } else if (!hasSpecificMatches) {
      target = fallbackCandidates;
    }
    if (!target || !canRetainCandidate(target, candidate, score, resultLimit)) continue;

    const evidence = buildEvidence(project, candidate, scored);
    retainBoundedCandidate(target, { candidate, score, specificScore, evidence }, resultLimit);
  }

  const similarProjects = (hasSpecificMatches ? specificCandidates : fallbackCandidates)
    .sort(compareScoredCandidates)
    .map(({ candidate, score, specificScore, evidence }) => {
      const recommendation = { ...candidate, score, specificScore, evidence };
      return hasSpecificMatches
        ? recommendation
        : { ...recommendation, evidence: ['Broad discovery fallback from the public catalog'] };
    });

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
