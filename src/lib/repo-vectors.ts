import { getCloudflareContext } from '@opennextjs/cloudflare';

import {
  denyVectorizeStorageGrowth,
  reserveVectorizeQuery,
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
  denyStorageGrowth(): void;
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
  let reservationAvailable = false;
  return {
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
    async upsert(vectors: RepoVectorInput[]): Promise<void> {
      if (vectors.length === 0) return;
      budget.denyStorageGrowth();
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
    denyStorageGrowth: denyVectorizeStorageGrowth,
  });
}
