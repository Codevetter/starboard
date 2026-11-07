import type { ProjectSourceContext } from '@/lib/project-context';
import { getToolDefinition } from '@/lib/repo-tools';

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
  sourceContext?: ProjectSourceContext;
  /**
   * Normalized embedding similarity (0–1) when this repo arrived via vector
   * retrieval. Absent for candidates that only matched lexical or structured
   * lanes.
   */
  semanticSimilarity?: number;
}

export interface ProjectRecommendation extends ProjectRecommendationRepo {
  score: number;
  evidence: string[];
  role?: 'reference' | 'integration';
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
  reason: string;
}

export interface ProjectRecommendationResult {
  similarProjects: ProjectRecommendation[];
  recommendedTools: GroundedToolRecommendation[];
  fallback: boolean;
  context: {
    language: string | null;
    topics: string[];
    tools: ProjectToolSignal[];
    sourceContext?: ProjectSourceContext;
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
  'are',
  'can',
  'has',
  'have',
  'its',
  'not',
  'our',
  'your',
  'you',
  'all',
  'also',
  'more',
  'new',
  'one',
  'out',
  'run',
  'get',
  'into',
  'been',
  'only',
  'will',
  'user',
  'users',
  'support',
  'supports',
  'simple',
  'fast',
  'modern',
  'powerful',
  'local',
  'native',
  'desktop',
  'mobile',
  'web',
  'api',
  'apps',
  'platform',
  'macos',
  'ios',
  'windows',
  'linux',
  'swift',
  'typescript',
  'javascript',
  'python',
  'rust',
  'golang',
  'java',
  'opensource',
  'open-source',
  'developer',
  'development',
  'developer-tools',
  'framework',
  'library',
  'react',
  'nextjs',
  'next.js',
  'node',
  'nodejs',
  'cloudflare',
  'workers',
  'swiftui',
  'appkit',
  'frontend',
  'backend',
  'server',
  'client',
  'built',
  'based',
  'features',
  'provides',
  'includes',
  'available',
  'data',
  'ai',
  'source',
  'personal',
  'manage',
  'management',
  'system',
  'systems',
  'service',
  'services',
  'content',
  'workspace',
  'workflow',
  'workflows',
  'across',
  'designed',
  'helps',
  'help',
  'built-in',
  'integrated',
  'integration',
  'self-hosted',
  'self',
  'hosted',
  'free',
  'public',
  'automatically',
  'private',
  'privacy',
  'secure',
  'security',
  'phone',
  'iphone',
  'ipad',
  'account',
  'accounts',
  'sync',
  'synchronization',
  'history',
  'storage',
  'browser',
  'read-only',
  'read',
  'write',
  'save',
  'saved',
  'optional',
  'keep',
  'close',
  'works',
  'work',
  'without',
  'first',
  'when',
  'each',
  'then',
  'than',
  'their',
  'they',
  'which',
  'what',
  'does',
  'how',
  'product',
  'issue',
  'note',
  'people',
  'person',
  'thing',
  'someone',
  'remain',
  'own',
  'over',
  'via',
  'cli',
  'mcp',
  'codex',
  'claude',
  'coding',
  'agent',
  'local-first',
  'live',
  'explicit',
  'larger',
  'smaller',
  'next',
  'still',
  'doc',
  'documentation',
  'file',
  'directory',
  'runtime',
  'deployment',
]);

const MIN_SPECIFIC_PEER_SCORE = 12;
const MIN_GROUNDED_TOOL_CONFIDENCE = 65;
const MIN_GROUNDED_TOOL_SUPPORT = 2;
const SEMANTIC_SCORE_WEIGHT = 24;
const COMPETING_TOOL_CATEGORIES = new Set(['framework', 'package-manager', 'cloud', 'database']);
const GENERIC_TOPICS = new Set([
  'ai',
  'llm',
  'llms',
  'ai-agents',
  'agents',
  'artificial-intelligence',
  'machine-learning',
  'generative-ai',
  'local-first',
  'privacy',
  'productivity',
  'saas',
  'claude-code',
  'codex',
  'coding-agents',
  'personal-data',
  'cloudkit',
  'd1',
  'fleet',
  'catalog',
]);
const ALTERNATIVE_TOOL_GROUPS = [
  ['jest', 'vitest'],
  ['eslint', 'biome'],
  ['npm', 'pnpm', 'yarn'],
];

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
      ?.map((token) => token.replace(/\.+$/, ''))
      .filter((token) => !GENERIC_TOKENS.has(token) && !getToolDefinition(token))
      .map((token) => token.replace(/ies$/, 'y').replace(/(?<!s)s$/, ''))
      .filter((token) => !GENERIC_TOKENS.has(token)) ?? []
  );
}

/** Purpose terms come first in lexical retrieval; repository names and stack are weak evidence. */
export function projectPurposeTerms(project: ProjectRecommendationRepo): string[] {
  return [
    ...meaningfulTokens(
      project.description,
      ...(project.sourceContext?.documents?.map((document) => document.text) ?? []),
      project.sourceContext?.readme,
      ...project.topics.filter((topic) => !GENERIC_TOPICS.has(topic)),
      project.aiSummary,
      project.aiCategory,
      ...(project.aiKeywords ?? [])
    ),
  ];
}

const RUNTIME_SIGNALS = [
  { family: 'js', languages: ['typescript', 'javascript'], manifest: /package\.json$/ },
  { family: 'swift', languages: ['swift'], manifest: /Package\.swift$/ },
  { family: 'python', languages: ['python'], manifest: /(?:pyproject\.toml|requirements\.txt)$/ },
  { family: 'rust', languages: ['rust'], manifest: /Cargo\.toml$/ },
  { family: 'go', languages: ['go'], manifest: /go\.mod$/ },
];
function runtimeFamilies(project: ProjectRecommendationRepo): Set<string> {
  const families = new Set<string>();
  const language = project.language?.toLowerCase();
  const files = project.sourceContext?.files ?? [];
  for (const signal of RUNTIME_SIGNALS) {
    if (
      signal.languages.includes(language ?? '') ||
      files.some((file) => signal.manifest.test(file))
    )
      families.add(signal.family);
  }
  if (language && families.size === 0) families.add(language);
  return families;
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

function eligibleTool(
  tool: ProjectToolSignal,
  existingKeys: Set<string>,
  existingCategories: Set<string>
): boolean {
  const key = tool.key.trim().toLowerCase();
  const category = tool.category.trim().toLowerCase();
  return Boolean(
    key &&
      !existingKeys.has(key) &&
      category !== 'language' &&
      tool.confidence >= MIN_GROUNDED_TOOL_CONFIDENCE &&
      !ALTERNATIVE_TOOL_GROUPS.some(
        (group) => group.includes(key) && group.some((existing) => existingKeys.has(existing))
      ) &&
      !(COMPETING_TOOL_CATEGORIES.has(category) && existingCategories.has(category))
  );
}

export function isProjectCandidate(
  project: ProjectRecommendationRepo,
  candidate: ProjectRecommendationRepo
): boolean {
  return (
    candidate.id !== project.id &&
    candidate.fullName.toLowerCase() !== project.fullName.toLowerCase() &&
    !candidate.archived &&
    !/no longer (?:works|working|maintained|supported)|not being actively maintained|is (?:deprecated|unmaintained)|discontinued project/i.test(
      candidate.description ?? ''
    )
  );
}

export function recommendToolsFromPeers(
  project: ProjectRecommendationRepo,
  peers: ProjectRecommendation[],
  fallback: boolean,
  limit = 12
): GroundedToolRecommendation[] {
  if (fallback || project.sourceContext?.status === 'unavailable') return [];

  const existingToolKeys = normalizedSet(project.tools.map((tool) => tool.key));
  const existingToolCategories = normalizedSet(project.tools.map((tool) => tool.category));
  const recommendations = new Map<string, GroundedToolRecommendation>();
  const projectRuntimes = runtimeFamilies(project);

  for (const peer of peers) {
    // Cross-runtime repositories can be useful references without supplying
    // compatible dependency recommendations for this project's implementation.
    if (intersection(projectRuntimes, runtimeFamilies(peer)).length === 0) continue;
    for (const tool of peer.tools) {
      const key = tool.key.trim().toLowerCase();
      const category = tool.category.trim().toLowerCase();
      if (!eligibleTool(tool, existingToolKeys, existingToolCategories)) continue;

      const current = recommendations.get(key) ?? {
        key: tool.key,
        name: tool.name,
        category: tool.category,
        score: 0,
        supportCount: 0,
        sources: [],
        reason: `Not detected in this project; used by related ${project.language ?? 'compatible-runtime'} repositories. Evaluate compatibility before adoption.`,
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
  semanticScore: number;
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
  purposeTokens: Set<string>;
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
    for (const topic of topicMatches) {
      const specific =
        !GENERIC_TOKENS.has(topic) && !GENERIC_TOPICS.has(topic) && !getToolDefinition(topic);
      score += specific ? 12 : 2;
      if (specific) specificScore += 12;
    }
  }

  return { score, specificScore, languageMatch, topicMatches };
}

function scoreToolsAndCategories(
  ctx: ScoreCandidateContext,
  candidateTools: { keys: Set<string>; categories: Set<string> }
): { score: number; specificScore: number; toolMatches: string[]; categoryMatches: string[] } {
  let score = 0;
  const specificScore = 0;

  const toolMatches = intersection(ctx.projectToolKeys, candidateTools.keys, 2);
  if (toolMatches.length > 0) {
    const value = toolMatches.length * 6;
    score += value;
  }

  const categoryMatches = intersection(ctx.projectToolCategories, candidateTools.categories)
    .filter((category) => !toolMatches.includes(category))
    .slice(0, 2);
  if (categoryMatches.length > 0) {
    const value = categoryMatches.length;
    score += value;
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
    for (const token of tokenMatches) {
      const isPurpose = ctx.purposeTokens.has(token);
      tokenScore += isPurpose ? 10 : 2;
      tokenSpecific += isPurpose ? 6 : 0;
    }
  }

  const semanticScore = Math.round(
    Math.max(0, Math.min(1, candidate.semanticSimilarity ?? 0)) * SEMANTIC_SCORE_WEIGHT
  );

  return {
    score: langTopic.score + toolCat.score + tokenScore + semanticScore,
    // Weak embedding proximity and shared infrastructure must not certify a
    // topical mismatch. Allow strong semantic evidence for genuine synonyms.
    specificScore:
      langTopic.specificScore +
      tokenSpecific +
      ((candidate.semanticSimilarity ?? 0) >= 0.85 ? semanticScore : 0),
    languageMatch: langTopic.languageMatch,
    semanticScore,
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
  if (scored.semanticScore > 0) {
    evidence.push('Semantically close in the repository embedding index');
  }
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
  const projectTokens = new Set(projectPurposeTerms(project));
  const purposeTokens = meaningfulTokens(
    project.description,
    project.sourceContext?.readme.slice(0, 600),
    project.aiSummary
  );
  const resultLimit = Math.max(1, Math.min(limit, 50));

  let hasSpecificMatches = false;
  const specificCandidates: ScoredProjectCandidate[] = [];
  for (const candidate of candidates) {
    if (!isProjectCandidate(project, candidate)) continue;

    const scored = scoreCandidate(project, candidate, {
      projectTopics,
      projectToolKeys,
      projectToolCategories,
      projectLanguage,
      projectTokens,
      purposeTokens,
    });
    const { score, specificScore } = scored;

    let target: ScoredProjectCandidate[] | null = null;
    if (specificScore >= MIN_SPECIFIC_PEER_SCORE) {
      if (!hasSpecificMatches) {
        hasSpecificMatches = true;
      }
      target = specificCandidates;
    }
    if (!target || !canRetainCandidate(target, candidate, score, resultLimit)) continue;

    const evidence = buildEvidence(project, candidate, scored);
    retainBoundedCandidate(target, { candidate, score, specificScore, evidence }, resultLimit);
  }

  const similarProjects = (hasSpecificMatches ? specificCandidates : [])
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
      ...(project.sourceContext ? { sourceContext: project.sourceContext } : {}),
    },
  };
}
