import { db } from '@/db';
import type { DbClient } from '@/db/client';
import { projectRecommendationFromRow } from '@/lib/connected-projects';
import { buildRepoEmbeddingText, generateEmbeddings } from '@/lib/embeddings';
import {
  type ProjectRecommendationRepo,
  type ProjectRecommendationResult,
  rankProjectRecommendations,
  isProjectCandidate,
  projectPurposeTerms,
  recommendToolsFromPeers,
} from '@/lib/project-recommendations';
import { reviewProjectQuality, type ProjectQualityReview } from '@/lib/project-quality-review';
import { repoVectors, type RepoVectorMatch } from '@/lib/repo-vectors';
import { ftsSearchQuery, rrfFuse } from '@/lib/search';
import { queryKnowledgeCatalog } from '@/lib/knowledge-catalog';
import { knowledgePipelineEnabled } from '@/lib/knowledgebase';
import {
  knowledgeProjectFeatures,
  type KnowledgeProjectFeature,
} from '@/lib/knowledge-project-profile';
import { reviewKnowledgeProject } from '@/lib/knowledge-decisions';
import { prepareCatalogCapabilities } from '@/lib/knowledge-catalog-capabilities';

const MIN_STARS_FLOOR = 5000;
const VECTOR_TOP_K = 100;
const VECTOR_DISTANCE_MAX = 0.62;
const LEXICAL_LIMIT = 250;
const STRUCTURED_LIMIT = 150;
const HYDRATION_LIMIT = 300;
const FALLBACK_LIMIT = 100;
const SEMANTIC_DIAGNOSTIC_MARKER = '[starboard-semantic-diagnostic]';

const ELIGIBLE_REPO_SQL =
  'r.id IN (SELECT r2.id FROM repos r2 WHERE r2.stargazers_count >= ? UNION SELECT community_ur.repo_id FROM user_repos community_ur WHERE community_ur.is_starred = 1)';

export type ProjectRetrievalMode =
  | 'knowledgebase'
  | 'hybrid'
  | 'semantic'
  | 'lexical-structured'
  | 'structured'
  | 'fallback';

interface ProjectRetrievalSummary {
  mode: ProjectRetrievalMode;
  candidateCount: number;
  semanticCandidates: number;
  lexicalCandidates: number;
  structuredCandidates: number;
  unavailableSources?: Array<'semantic' | 'lexical' | 'structured'>;
}

export interface ProjectIntelligenceResult extends ProjectRecommendationResult {
  retrieval: ProjectRetrievalSummary;
  quality?: {
    status: 'reviewed' | 'unavailable' | 'evidence-only';
    reason?: ProjectQualityReview['reason'];
    reviewedFeatures?: number;
    totalFeatures?: number;
    unavailableFeatures?: number;
  };
}

interface VectorStore {
  query(vector: number[], topK: number): Promise<RepoVectorMatch[]>;
  queryByRepoId(repoId: number, topK: number): Promise<RepoVectorMatch[]>;
}

export interface ProjectIntelligenceDependencies {
  database: Pick<DbClient, 'execute'>;
  vectorStore: () => VectorStore;
  embed: (texts: string[]) => Promise<number[][]>;
  reviewCandidates?: (
    project: ProjectRecommendationRepo,
    candidates: ProjectRecommendationRepo[]
  ) => Promise<ProjectQualityReview>;
  projectFeatures?: (project: ProjectRecommendationRepo) => Promise<KnowledgeProjectFeature[]>;
  queryKnowledge?: typeof queryKnowledgeCatalog;
  prepareKnowledgeCandidates?: (candidates: ProjectRecommendationRepo[]) => Promise<number[]>;
  reviewFeature?: (
    project: ProjectRecommendationRepo,
    candidates: ProjectRecommendationRepo[],
    feature: KnowledgeProjectFeature
  ) => Promise<ProjectQualityReview>;
}

const defaultDependencies: ProjectIntelligenceDependencies = {
  database: db,
  vectorStore: repoVectors,
  embed: generateEmbeddings,
  reviewCandidates: reviewProjectQuality,
  projectFeatures: knowledgeProjectFeatures,
  queryKnowledge: (query, limit) => queryKnowledgeCatalog(query, limit, true),
  prepareKnowledgeCandidates: prepareCatalogCapabilities,
  reviewFeature: (project, candidates, feature) =>
    reviewKnowledgeProject(project, candidates, undefined, feature),
};

function projectText(project: ProjectRecommendationRepo): string {
  const metadata = buildRepoEmbeddingText({
    full_name: project.fullName,
    description: project.description,
    language: project.language,
    topics: project.topics,
    ai: {
      summary: project.aiSummary,
      category: project.aiCategory,
      keywords: project.aiKeywords,
    },
  });
  const documents = project.sourceContext?.documents?.filter((document) =>
    /\.(?:md|markdown|rst|txt)$/i.test(document.path)
  );
  // Source code supports feature decisions; its identifiers must not dominate
  // the existing whole-project embedding when the Knowledgebase path is off.
  const prose = documents?.map((document) => document.text.slice(0, 1200)).join(' | ');
  return [metadata, prose || project.sourceContext?.readme?.slice(0, 6000)]
    .filter(Boolean)
    .join(' | ');
}

async function semanticCandidates(
  project: ProjectRecommendationRepo,
  text: string,
  dependencies: ProjectIntelligenceDependencies
): Promise<RepoVectorMatch[]> {
  const store = dependencies.vectorStore();
  // Stored vectors predate request-time README context. Embed the current
  // purpose rather than silently reusing the metadata-only vector.
  let matches =
    project.sourceContext?.readme || project.sourceContext?.documents?.length
      ? []
      : await store.queryByRepoId(project.id, VECTOR_TOP_K);
  if (matches.length === 0) {
    let embedding: number[] | undefined;
    try {
      [embedding] = await dependencies.embed([text]);
      if (!embedding) throw new Error('Project semantic embedding is unavailable');
    } catch (error) {
      console.warn(SEMANTIC_DIAGNOSTIC_MARKER, {
        stage: 'semantic_embedding',
        reason: 'rejected',
      });
      throw error;
    }
    matches = await store.query(embedding, VECTOR_TOP_K);
  }
  return matches.filter(
    (match) => match.repoId !== project.id && match.distance <= VECTOR_DISTANCE_MAX
  );
}

async function lexicalCandidates(
  project: ProjectRecommendationRepo,
  text: string,
  dependencies: ProjectIntelligenceDependencies
): Promise<number[]> {
  const purpose = projectPurposeTerms(project).slice(0, 24).join(' ');
  const query = ftsSearchQuery(purpose || text);
  if (!query) return [];
  const result = await dependencies.database.execute({
    sql: `SELECT r.id, MIN(matches.rank) AS best_rank
          FROM (
            SELECT repos_fts.rowid AS id,
                   bm25(repos_fts, 10.0, 14.0, 3.0, 1.5, 2.5) AS rank
            FROM repos_fts
            WHERE repos_fts MATCH ?
            UNION ALL
            SELECT repo_ai_metadata_fts.rowid AS id,
                   bm25(repo_ai_metadata_fts, 4.0, 3.0, 2.0, 2.0, 2.5) AS rank
            FROM repo_ai_metadata_fts
            WHERE repo_ai_metadata_fts MATCH ?
          ) matches
          JOIN repos r ON r.id = matches.id
          WHERE r.id != ? AND r.archived = 0
          GROUP BY r.id
          ORDER BY best_rank ASC, r.stargazers_count DESC
          LIMIT ?`,
    args: [query, query, project.id, LEXICAL_LIMIT],
  });
  return result.rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

async function structuredCandidates(
  project: ProjectRecommendationRepo,
  dependencies: ProjectIntelligenceDependencies
): Promise<number[]> {
  if (!project.language) return [];
  const result = await dependencies.database.execute({
    sql: `SELECT r.id
          FROM repos r
          WHERE r.id != ?
            AND r.archived = 0
            AND r.language = ? COLLATE NOCASE
            AND ${ELIGIBLE_REPO_SQL}
          ORDER BY r.stargazers_count DESC, r.full_name ASC
          LIMIT ?`,
    args: [project.id, project.language, MIN_STARS_FLOOR, STRUCTURED_LIMIT],
  });
  return result.rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

async function hydrateCandidates(
  ids: number[],
  projectId: number,
  dependencies: ProjectIntelligenceDependencies,
  similarityById: Map<number, number>
): Promise<ProjectRecommendationRepo[]> {
  const result = await dependencies.database.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 aim.summary AS ai_summary,
                 aim.category AS ai_category,
                 aim.keywords AS ai_keywords,
                 COALESCE((
                   SELECT json_group_array(json_object(
                     'key', rt.tool_key,
                     'name', rt.tool_name,
                     'category', rt.category,
                     'confidence', rt.confidence
                   ))
                   FROM repo_tools rt
                   WHERE rt.repo_id = r.id
                 ), '[]') AS tools
          FROM repos r
          LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id
          WHERE r.id != ?
            AND r.archived = 0
            AND r.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
            AND ${ELIGIBLE_REPO_SQL}`,
    args: [projectId, JSON.stringify(ids), MIN_STARS_FLOOR],
  });
  const byId = new Map(
    result.rows.map((row) => {
      const candidate = projectRecommendationFromRow(row);
      return [candidate.id, candidate] as const;
    })
  );
  return ids.flatMap((id) => {
    const candidate = byId.get(id);
    if (!candidate) return [];
    const semanticSimilarity = similarityById.get(id);
    return [semanticSimilarity === undefined ? candidate : { ...candidate, semanticSimilarity }];
  });
}

async function fallbackCandidates(
  projectId: number,
  dependencies: ProjectIntelligenceDependencies
): Promise<ProjectRecommendationRepo[]> {
  const result = await dependencies.database.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 aim.summary AS ai_summary,
                 aim.category AS ai_category,
                 aim.keywords AS ai_keywords,
                 COALESCE((
                   SELECT json_group_array(json_object(
                     'key', rt.tool_key,
                     'name', rt.tool_name,
                     'category', rt.category,
                     'confidence', rt.confidence
                   ))
                   FROM repo_tools rt
                   WHERE rt.repo_id = r.id
                 ), '[]') AS tools
          FROM repos r
          LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id
          WHERE r.id != ?
            AND r.archived = 0
            AND ${ELIGIBLE_REPO_SQL}
          ORDER BY r.stargazers_count DESC, r.full_name ASC
          LIMIT ?`,
    args: [projectId, MIN_STARS_FLOOR, FALLBACK_LIMIT],
  });
  return result.rows.map(projectRecommendationFromRow);
}

function retrievalMode(
  semanticCount: number,
  lexicalCount: number,
  structuredCount: number,
  fallback: boolean
): ProjectRetrievalMode {
  if (fallback) return 'fallback';
  if (semanticCount > 0 && (lexicalCount > 0 || structuredCount > 0)) return 'hybrid';
  if (semanticCount > 0) return 'semantic';
  if (lexicalCount > 0) return 'lexical-structured';
  return 'structured';
}

async function reviewRanked(
  project: ProjectRecommendationRepo,
  candidates: ProjectRecommendationRepo[],
  candidateIds: number[],
  limit: number,
  reviewCandidates: ProjectIntelligenceDependencies['reviewCandidates']
) {
  const ranked = rankProjectRecommendations(project, candidates, limit);
  let quality: NonNullable<ProjectIntelligenceResult['quality']> = { status: 'evidence-only' };
  if (reviewCandidates) {
    const shortlistIds = new Set<number>();
    const rankedIds = rankProjectRecommendations(project, candidates, 24).similarProjects.map(
      (repo) => repo.id
    );
    for (const id of [...rankedIds, ...candidateIds.slice(0, 24)]) {
      if (shortlistIds.size >= 40) break;
      shortlistIds.add(id);
    }
    const byId = new Map(
      candidates.filter((repo) => isProjectCandidate(project, repo)).map((repo) => [repo.id, repo])
    );
    const shortlist = knowledgePipelineEnabled()
      ? candidates.filter((repo) => byId.has(repo.id)).slice(0, 20)
      : [...shortlistIds].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    let review: ProjectQualityReview;
    try {
      review = await reviewCandidates(project, shortlist);
    } catch {
      review = { status: 'unavailable', matches: [] };
    }
    quality = { status: review.status, ...(review.reason ? { reason: review.reason } : {}) };
    // An unavailable reviewer must not turn weak lexical overlap into a
    // confident product recommendation. The response exposes the outage.
    ranked.similarProjects =
      review.status === 'reviewed'
        ? review.matches.slice(0, Math.max(1, Math.min(limit, 50))).flatMap((match, index) => {
            const candidate = byId.get(match.repoId);
            return candidate
              ? [
                  {
                    ...candidate,
                    score: review.matches.length - index,
                    role: match.role,
                    evidence: [
                      `Project: “${match.projectEvidence}”`,
                      `Candidate: “${match.candidateEvidence}”`,
                    ],
                  },
                ]
              : [];
          })
        : [];
    ranked.fallback = ranked.similarProjects.length === 0;
    ranked.recommendedTools = recommendToolsFromPeers(
      project,
      ranked.similarProjects.filter((repo) => repo.role === 'integration'),
      ranked.fallback
    );
  }

  return { ranked, quality };
}

export async function knowledgeProjectCandidates(
  project: ProjectRecommendationRepo,
  dependencies = defaultDependencies
): Promise<ProjectRecommendationRepo[]> {
  return (await knowledgeFeatureCandidates(project, dependencies)).candidates;
}

async function knowledgeFeatureCandidates(
  project: ProjectRecommendationRepo,
  dependencies: ProjectIntelligenceDependencies
) {
  const features = [
    ...(await (dependencies.projectFeatures ?? knowledgeProjectFeatures)(project)),
  ].sort(
    (a, b) =>
      Number(a.operation?.importance === 'supporting') -
      Number(b.operation?.importance === 'supporting')
  );
  const results = await Promise.all(
    features.map(async (feature) => {
      const queries = [
        ...new Set(
          [
            feature.operation
              ? `${feature.operation.input} ${feature.operation.action} ${feature.operation.output}`
              : feature.description,
            feature.description,
            feature.searchQuery,
          ].filter((query): query is string => !!query)
        ),
      ];
      const settledArms = await Promise.allSettled(
        queries.map((query) => (dependencies.queryKnowledge ?? queryKnowledgeCatalog)(query, 50))
      );
      const arms = settledArms.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      );
      const matches: Array<{ repoId: number; rankScore: number }> = [];
      const seen = new Set<number>();
      // Keep the documented object and operation. A compact abstraction can lose
      // essential words (HTML extraction versus stylesheet extraction).
      for (let rank = 0; rank < 50 && matches.length < 50; rank++)
        for (const arm of arms) {
          const match = arm[rank];
          if (match && !seen.has(match.repoId)) {
            seen.add(match.repoId);
            matches.push(match);
          }
          if (matches.length === 50) break;
        }
      return matches;
    })
  );
  // Reserve places for each implemented feature. A broad purpose query must
  // not bury a good result for a smaller workflow after global rank fusion.
  const ids: number[] = [];
  const seen = new Set<number>([project.id]);
  for (let rank = 0; rank < 50 && ids.length < HYDRATION_LIMIT; rank++)
    for (const matches of results) {
      const id = matches[rank]?.repoId;
      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
      if (ids.length === HYDRATION_LIMIT) break;
    }
  return {
    features,
    results,
    candidates: await hydrateCandidates(ids, project.id, dependencies, new Map()),
  };
}

async function retrieveKnowledgeIntelligence(
  project: ProjectRecommendationRepo,
  limit: number,
  dependencies: ProjectIntelligenceDependencies
): Promise<ProjectIntelligenceResult> {
  const retrieved = await knowledgeFeatureCandidates(project, dependencies);
  const candidates = retrieved.candidates;
  const hasOperations = retrieved.features.some((feature) => feature.operation);
  const indexes = retrieved.features.flatMap((feature, index) =>
    !hasOperations || feature.operation ? [index] : []
  );
  const features = indexes.map((index) => retrieved.features[index]);
  const results = indexes.map((index) => retrieved.results[index]);
  const reviewedCandidates = dependencies.prepareKnowledgeCandidates
    ? await prepareFeatureCandidates(
        features,
        results,
        candidates,
        dependencies.prepareKnowledgeCandidates
      )
    : candidates;
  const ids = reviewedCandidates.map((candidate) => candidate.id);
  const { ranked, quality } = dependencies.reviewFeature
    ? await reviewKnowledgeFeatures(
        project,
        { features, results },
        reviewedCandidates,
        limit,
        dependencies.reviewFeature
      )
    : await reviewRanked(project, candidates, ids, limit, dependencies.reviewCandidates);
  return {
    ...ranked,
    quality,
    retrieval: {
      mode: 'knowledgebase',
      candidateCount: candidates.length,
      semanticCandidates: 0,
      lexicalCandidates: 0,
      structuredCandidates: 0,
    },
  };
}

async function prepareFeatureCandidates(
  features: KnowledgeProjectFeature[],
  results: Array<Array<{ repoId: number; rankScore: number }>>,
  candidates: ProjectRecommendationRepo[],
  prepare: NonNullable<ProjectIntelligenceDependencies['prepareKnowledgeCandidates']>
) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ordered = new Map<number, ProjectRecommendationRepo>();
  for (let rank = 0; rank < 8 && ordered.size < 24; rank++)
    for (const [index] of features.entries()) {
      const candidate = byId.get(results[index][rank]?.repoId);
      if (candidate) ordered.set(candidate.id, candidate);
      if (ordered.size === 24) break;
    }
  const prepared = new Set(await prepare([...ordered.values()]));
  return candidates.filter((candidate) => prepared.has(candidate.id));
}

function featureRecommendation(
  candidate: ProjectRecommendationRepo,
  match: ProjectQualityReview['matches'][number],
  feature: KnowledgeProjectFeature
) {
  return {
    ...candidate,
    role: 'reference' as const,
    score: match.utility === 'high' ? 2 : 1,
    evidence: [
      ...(match.comparisonAction ? [`Compare: ${match.comparisonAction}`] : []),
      ...(match.differences ? [`Limits: ${match.differences}`] : []),
      `Feature: ${feature.description}`,
      `Project: “${match.projectEvidence}”`,
      `Candidate: “${match.candidateEvidence}”`,
    ],
  };
}

async function reviewKnowledgeFeatures(
  project: ProjectRecommendationRepo,
  retrieval: {
    features: KnowledgeProjectFeature[];
    results: Array<Array<{ repoId: number; rankScore: number }>>;
  },
  candidates: ProjectRecommendationRepo[],
  limit: number,
  review: NonNullable<ProjectIntelligenceDependencies['reviewFeature']>
) {
  const { features, results } = retrieval;
  const byId = new Map(
    candidates
      .filter((candidate) => isProjectCandidate(project, candidate))
      .map((candidate) => [candidate.id, candidate])
  );
  const reviews: ProjectQualityReview[] = [];
  // Bound concurrency and preserve each feature's retrieved candidate set.
  for (let offset = 0; offset < features.length; offset += 3)
    reviews.push(
      ...(await Promise.all(
        features.slice(offset, offset + 3).map(async (feature, index) => {
          const shortlist = results[offset + index]
            .flatMap((match) => (byId.has(match.repoId) ? [byId.get(match.repoId)!] : []))
            .slice(0, 8);
          try {
            if (!shortlist.length)
              return {
                status: 'unavailable' as const,
                matches: [],
                reason: 'insufficient-context' as const,
              };
            return await review(project, shortlist, feature);
          } catch {
            return {
              status: 'unavailable' as const,
              matches: [],
              reason: 'provider-error' as const,
            };
          }
        })
      ))
    );
  const ranked = rankProjectRecommendations(project, candidates, limit);
  const seen = new Set<number>();
  ranked.similarProjects = [];
  for (let rank = 0; rank < 4 && ranked.similarProjects.length < limit; rank++)
    for (const [index, result] of reviews.entries()) {
      const match = result.status === 'reviewed' ? result.matches[rank] : undefined;
      const candidate = match && byId.get(match.repoId);
      if (
        !match ||
        match.role !== 'reference' ||
        !candidate ||
        seen.has(candidate.id) ||
        !results[index].some((row) => row.repoId === candidate.id)
      )
        continue;
      seen.add(candidate.id);
      ranked.similarProjects.push(featureRecommendation(candidate, match, features[index]));
      if (ranked.similarProjects.length === limit) break;
    }
  ranked.fallback = ranked.similarProjects.length === 0;
  ranked.recommendedTools = [];
  const available = reviews.filter((result) => result.status === 'reviewed').length;
  return {
    ranked,
    quality: {
      status: available ? ('reviewed' as const) : ('unavailable' as const),
      reviewedFeatures: available,
      totalFeatures: features.length,
      unavailableFeatures: features.length - available,
    },
  };
}

export function createProjectIntelligence(
  dependencies: ProjectIntelligenceDependencies = defaultDependencies
) {
  return async function retrieveProjectIntelligence(
    project: ProjectRecommendationRepo,
    limit = 24
  ): Promise<ProjectIntelligenceResult> {
    const text = projectText(project);
    if (knowledgePipelineEnabled())
      return retrieveKnowledgeIntelligence(project, limit, dependencies);
    const [semanticResult, lexicalResult, structuredResult] = await Promise.allSettled([
      semanticCandidates(project, text, dependencies),
      lexicalCandidates(project, text, dependencies),
      structuredCandidates(project, dependencies),
    ]);
    const semanticMatches = semanticResult.status === 'fulfilled' ? semanticResult.value : [];
    const semanticIds = semanticMatches.map((match) => match.repoId);
    // Carry normalized similarity (0 = distance ceiling, 1 = identical) into
    // the evidence reranker so embedding proximity survives past retrieval.
    const similarityById = new Map(
      semanticMatches.map((match) => [
        match.repoId,
        Math.max(0, 1 - match.distance / VECTOR_DISTANCE_MAX),
      ])
    );
    const lexicalIds = lexicalResult.status === 'fulfilled' ? lexicalResult.value : [];
    const structuredIds = structuredResult.status === 'fulfilled' ? structuredResult.value : [];
    const candidateIds = rrfFuse([semanticIds, lexicalIds, structuredIds]).slice(
      0,
      HYDRATION_LIMIT
    );
    const usingFallback = candidateIds.length === 0;
    const candidates = usingFallback
      ? await fallbackCandidates(project.id, dependencies)
      : await hydrateCandidates(candidateIds, project.id, dependencies, similarityById);
    const { ranked, quality } = await reviewRanked(
      project,
      candidates,
      candidateIds,
      limit,
      dependencies.reviewCandidates
    );

    return {
      ...ranked,
      quality,
      retrieval: {
        mode: retrievalMode(
          semanticIds.length,
          lexicalIds.length,
          structuredIds.length,
          usingFallback
        ),
        candidateCount: candidates.length,
        semanticCandidates: semanticIds.length,
        lexicalCandidates: lexicalIds.length,
        structuredCandidates: structuredIds.length,
        unavailableSources: (
          [
            ['semantic', semanticResult],
            ['lexical', lexicalResult],
            ['structured', structuredResult],
          ] as const
        ).flatMap(([source, result]) => (result.status === 'rejected' ? [source] : [])),
      },
    };
  };
}

export const retrieveProjectIntelligence = createProjectIntelligence();
