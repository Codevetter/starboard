import { getCloudflareContext } from '@opennextjs/cloudflare';

import {
  reserveVectorizeQuery,
  reserveVectorizeStorage,
  SharedBudgetDeniedError,
  type SharedBudgetNamespace,
} from './shared-ai-budget';

export interface RepoVectorMatch {
  repoId: number;
  distance: number;
}

export interface RepoVectorInput {
  repoId: number;
  values: number[];
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

export function createRepoVectorStore(index: VectorizeIndexLike, budget: RepoVectorBudget) {
  const queryAdmission = Symbol('reserved-vectorize-query');
  const storageAdmissions = new Map<symbol, { count: number; monthKey: string }>();
  let reservationAvailable = false;
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
      await budget.reserveQuery(dimensions);
      reservationAvailable = true;
      return queryAdmission;
    },
    async query(vector: number[], topK: number, admitted?: symbol): Promise<RepoVectorMatch[]> {
      if (admitted === queryAdmission && reservationAvailable) reservationAvailable = false;
      else await budget.reserveQuery(vector.length);
      return normalizeMatches(
        await index.query(vector, {
          topK: boundedTopK(topK),
          returnValues: false,
          returnMetadata: 'none',
        })
      );
    },
    async queryByRepoId(repoId: number, topK: number): Promise<RepoVectorMatch[]> {
      await budget.reserveQuery(768);
      return normalizeMatches(
        await index.queryById(String(repoId), {
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
  const { env } = getCloudflareContext();
  const index = (env as unknown as { REPO_VECTORS?: VectorizeIndexLike }).REPO_VECTORS;
  if (!index) throw new Error('Cloudflare Vectorize binding REPO_VECTORS is unavailable');
  const namespace = Reflect.get(env, 'NEURON_BUDGET') as SharedBudgetNamespace | undefined;
  if (!namespace) throw new SharedBudgetDeniedError();
  return createRepoVectorStore(index, {
    reserveQuery: (dimensions) => reserveVectorizeQuery(namespace, dimensions),
    reserveStorage: (dimensions) => reserveVectorizeStorage(namespace, dimensions),
  });
}
