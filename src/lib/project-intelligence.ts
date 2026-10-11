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

const MIN_STARS_FLOOR = 5000;
const VECTOR_TOP_K = 100;
const VECTOR_DISTANCE_MAX = 0.62;
const LEXICAL_LIMIT = 250;
const STRUCTURED_LIMIT = 150;
const HYDRATION_LIMIT = 300;
const FALLBACK_LIMIT = 100;

const ELIGIBLE_REPO_SQL =
  'r.id IN (SELECT r2.id FROM repos r2 WHERE r2.stargazers_count >= ? UNION SELECT community_ur.repo_id FROM user_repos community_ur WHERE community_ur.is_starred = 1)';

export type ProjectRetrievalMode =
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
}

export interface ProjectIntelligenceResult extends ProjectRecommendationResult {
  retrieval: ProjectRetrievalSummary;
  quality?: {
    status: 'reviewed' | 'unavailable' | 'evidence-only';
    reason?: ProjectQualityReview['reason'];
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
}

const defaultDependencies: ProjectIntelligenceDependencies = {
  database: db,
  vectorStore: repoVectors,
  embed: generateEmbeddings,
  reviewCandidates: reviewProjectQuality,
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
  return [project.description, project.sourceContext?.readme, metadata].filter(Boolean).join(' | ');
}

async function semanticCandidates(
  project: ProjectRecommendationRepo,
  text: string,
  dependencies: ProjectIntelligenceDependencies
): Promise<RepoVectorMatch[]> {
  try {
    const store = dependencies.vectorStore();
    // Stored vectors predate request-time README context. Embed the current
    // purpose rather than silently reusing the metadata-only vector.
    let matches = project.sourceContext?.readme
      ? []
      : await store.queryByRepoId(project.id, VECTOR_TOP_K);
    if (matches.length === 0) {
      const [embedding] = await dependencies.embed([text]);
      if (!embedding) return [];
      matches = await store.query(embedding, VECTOR_TOP_K);
    }
    return matches.filter(
      (match) => match.repoId !== project.id && match.distance <= VECTOR_DISTANCE_MAX
    );
  } catch (error) {
    console.warn('Project semantic retrieval unavailable; using catalog evidence only', error);
    return [];
  }
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
            AND r.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    args: [projectId, JSON.stringify(ids)],
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
    const shortlist = [...shortlistIds].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
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

export function createProjectIntelligence(
  dependencies: ProjectIntelligenceDependencies = defaultDependencies
) {
  return async function retrieveProjectIntelligence(
    project: ProjectRecommendationRepo,
    limit = 24
  ): Promise<ProjectIntelligenceResult> {
    const text = projectText(project);
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
      },
    };
  };
}

export const retrieveProjectIntelligence = createProjectIntelligence();
