import { db } from '@/db';
import type { DbClient } from '@/db/client';
import { projectRecommendationFromRow } from '@/lib/connected-projects';
import { buildRepoEmbeddingText, generateEmbeddings } from '@/lib/embeddings';
import {
  type ProjectRecommendationRepo,
  type ProjectRecommendationResult,
  rankProjectRecommendations,
} from '@/lib/project-recommendations';
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
}

interface VectorStore {
  query(vector: number[], topK: number): Promise<RepoVectorMatch[]>;
  queryByRepoId(repoId: number, topK: number): Promise<RepoVectorMatch[]>;
}

export interface ProjectIntelligenceDependencies {
  database: Pick<DbClient, 'execute'>;
  vectorStore: () => VectorStore;
  embed: (texts: string[]) => Promise<number[][]>;
}

const defaultDependencies: ProjectIntelligenceDependencies = {
  database: db,
  vectorStore: repoVectors,
  embed: generateEmbeddings,
};

function projectText(project: ProjectRecommendationRepo): string {
  return buildRepoEmbeddingText({
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
}

async function semanticCandidates(
  project: ProjectRecommendationRepo,
  text: string,
  dependencies: ProjectIntelligenceDependencies
): Promise<number[]> {
  try {
    const store = dependencies.vectorStore();
    let matches = await store.queryByRepoId(project.id, VECTOR_TOP_K);
    if (matches.length === 0) {
      const [embedding] = await dependencies.embed([text]);
      if (!embedding) return [];
      matches = await store.query(embedding, VECTOR_TOP_K);
    }
    return matches
      .filter((match) => match.repoId !== project.id && match.distance <= VECTOR_DISTANCE_MAX)
      .map((match) => match.repoId);
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
  const query = ftsSearchQuery(text);
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
          WHERE r.id != ? AND ${ELIGIBLE_REPO_SQL}
          GROUP BY r.id
          ORDER BY best_rank ASC, r.stargazers_count DESC
          LIMIT ?`,
    args: [query, query, project.id, MIN_STARS_FLOOR, LEXICAL_LIMIT],
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
            AND r.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    args: [projectId, MIN_STARS_FLOOR, JSON.stringify(ids)],
  });
  const byId = new Map(
    result.rows.map((row) => {
      const candidate = projectRecommendationFromRow(row);
      return [candidate.id, candidate] as const;
    })
  );
  return ids.flatMap((id) => {
    const candidate = byId.get(id);
    return candidate ? [candidate] : [];
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
    const semanticIds = semanticResult.status === 'fulfilled' ? semanticResult.value : [];
    const lexicalIds = lexicalResult.status === 'fulfilled' ? lexicalResult.value : [];
    const structuredIds = structuredResult.status === 'fulfilled' ? structuredResult.value : [];
    const candidateIds = rrfFuse([semanticIds, lexicalIds, structuredIds]).slice(
      0,
      HYDRATION_LIMIT
    );
    const usingFallback = candidateIds.length === 0;
    const candidates = usingFallback
      ? await fallbackCandidates(project.id, dependencies)
      : await hydrateCandidates(candidateIds, project.id, dependencies);
    const ranked = rankProjectRecommendations(project, candidates, limit);

    return {
      ...ranked,
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
