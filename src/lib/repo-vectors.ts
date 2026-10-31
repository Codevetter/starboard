import { getCloudflareContext } from '@opennextjs/cloudflare';
import { db } from '@/db';
import { createKnowledgebaseRepoVectorStore } from './knowledge-catalog';
import { knowledgePipelineEnabled } from './knowledgebase';

import {
  reserveVectorizeQuery,
  reserveVectorizeStorage,
  SharedBudgetDeniedError,
  type SharedBudgetNamespace,
} from './shared-ai-budget';

const SEMANTIC_DIAGNOSTIC_MARKER = '[starboard-semantic-diagnostic]';

export interface RepoVectorMatch {
  repoId: number;
  distance: number;
}

export interface RepoVectorInput {
  repoId: number;
  values: number[];
  content?: string;
}

interface VectorizeMatchLike {
  id: string;
  score: number;
}

interface VectorizeMatchesLike {
  matches: VectorizeMatchLike[];
}

export interface VectorizeIndexLike {
  query(
    vector: number[],
    options: { topK: number; returnValues?: boolean; returnMetadata?: 'none' | 'indexed' | 'all' }
  ): Promise<VectorizeMatchesLike>;
  queryById(
    id: string,
    options: { topK: number; returnValues?: boolean; returnMetadata?: 'none' | 'indexed' | 'all' }
  ): Promise<VectorizeMatchesLike>;
  upsert(
    vectors: Array<{ id: string; values: number[]; metadata: { repoId: number } }>
  ): Promise<unknown>;
}

export interface RepoVectorBudget {
  reserveQuery(dimensions: number): Promise<void>;
  reserveStorage(dimensions: number): Promise<void>;
}

const VECTORIZE_MAX_TOP_K = 100;

function boundedTopK(topK: number): number {
  return Math.min(Math.max(Math.trunc(topK), 1), VECTORIZE_MAX_TOP_K);
}

function normalizeMatches(result: VectorizeMatchesLike): RepoVectorMatch[] {
  return result.matches.flatMap((match) => {
    const repoId = Number(match.id);
    if (!Number.isSafeInteger(repoId)) return [];
    return [{ repoId, distance: Math.max(0, 1 - match.score) }];
  });
}

async function queryWithDiagnostic(
  query: () => Promise<VectorizeMatchesLike>
): Promise<RepoVectorMatch[]> {
  try {
    return normalizeMatches(await query());
  } catch (error) {
    console.warn(SEMANTIC_DIAGNOSTIC_MARKER, {
      stage: 'vectorize_query',
      reason: 'rejected',
    });
    throw error;
  }
}

export function createRepoVectorStore(index: VectorizeIndexLike, budget: RepoVectorBudget) {
  const queryAdmission = Symbol('reserved-vectorize-query');
  const storageAdmissions = new Map<symbol, { count: number; monthKey: string }>();
  let reservationAvailable = false;
  async function reserveQueryBudget(dimensions: number): Promise<void> {
    try {
      await budget.reserveQuery(dimensions);
    } catch (error) {
      console.warn(SEMANTIC_DIAGNOSTIC_MARKER, {
        stage: 'vector_budget_reservation',
        reason: error instanceof SharedBudgetDeniedError ? 'denied' : 'rejected',
      });
      throw error;
    }
  }

  return {
    async reserveStorage(count: number): Promise<symbol> {
      if (!Number.isSafeInteger(count) || count < 1) throw new SharedBudgetDeniedError();
      await budget.reserveStorage(count * 768);
      const admission = Symbol('reserved-vectorize-storage');
      storageAdmissions.set(admission, { count, monthKey: new Date().toISOString().slice(0, 7) });
      return admission;
    },
    async reserveQuery(dimensions = 768): Promise<symbol> {
      if (reservationAvailable) throw new Error('Vectorize query reservation is already pending.');
      await reserveQueryBudget(dimensions);
      reservationAvailable = true;
      return queryAdmission;
    },
    async query(vector: number[], topK: number, admitted?: symbol): Promise<RepoVectorMatch[]> {
      if (admitted === queryAdmission && reservationAvailable) reservationAvailable = false;
      else await reserveQueryBudget(vector.length);
      return queryWithDiagnostic(() =>
        index.query(vector, {
          topK: boundedTopK(topK),
          returnValues: false,
          returnMetadata: 'none',
        })
      );
    },
    async queryByRepoId(repoId: number, topK: number): Promise<RepoVectorMatch[]> {
      await reserveQueryBudget(768);
      return queryWithDiagnostic(() =>
        index.queryById(String(repoId), {
          topK: boundedTopK(topK),
          returnValues: false,
          returnMetadata: 'none',
        })
      );
    },
    async upsert(vectors: RepoVectorInput[], admitted?: symbol): Promise<void> {
      if (vectors.length === 0) return;
      if (
        vectors.some(
          (v) =>
            !Number.isSafeInteger(v.repoId) ||
            v.repoId < 1 ||
            v.values.length !== 768 ||
            v.values.some((value) => !Number.isFinite(value))
        )
      ) {
        throw new Error(
          'Vectorize writes require repository IDs and raw finite 768-dimensional vectors.'
        );
      }
      if (admitted !== undefined) {
        const receipt = storageAdmissions.get(admitted);
        if (
          receipt?.count !== vectors.length ||
          receipt.monthKey !== new Date().toISOString().slice(0, 7)
        )
          throw new SharedBudgetDeniedError();
        storageAdmissions.delete(admitted);
      } else await budget.reserveStorage(vectors.length * 768);
      await index.upsert(
        vectors.map((vector) => ({
          id: String(vector.repoId),
          values: vector.values,
          metadata: { repoId: vector.repoId },
        }))
      );
    },
  };
}

export function repoVectors() {
  if (knowledgePipelineEnabled()) return createKnowledgebaseRepoVectorStore(db);
  let env: ReturnType<typeof getCloudflareContext>['env'];
  try {
    env = getCloudflareContext().env;
  } catch (error) {
    console.warn(SEMANTIC_DIAGNOSTIC_MARKER, {
      stage: 'vectorize_setup',
      reason: 'context_unavailable',
    });
    throw error;
  }
  const index = (env as unknown as { REPO_VECTORS?: VectorizeIndexLike }).REPO_VECTORS;
  if (!index) {
    console.warn(SEMANTIC_DIAGNOSTIC_MARKER, {
      stage: 'vectorize_setup',
      reason: 'binding_unavailable',
    });
    throw new Error('Cloudflare Vectorize binding REPO_VECTORS is unavailable');
  }
  const namespace = Reflect.get(env, 'NEURON_BUDGET') as SharedBudgetNamespace | undefined;
  if (!namespace) {
    console.warn(SEMANTIC_DIAGNOSTIC_MARKER, {
      stage: 'vectorize_setup',
      reason: 'budget_binding_unavailable',
    });
    throw new SharedBudgetDeniedError();
  }
  return createRepoVectorStore(index, {
    reserveQuery: (dimensions) => reserveVectorizeQuery(namespace, dimensions),
    reserveStorage: (dimensions) => reserveVectorizeStorage(namespace, dimensions),
  });
}
