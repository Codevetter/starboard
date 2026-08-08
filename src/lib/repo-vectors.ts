import { getCloudflareContext } from '@opennextjs/cloudflare';

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

export function createRepoVectorStore(index: VectorizeIndexLike) {
  return {
    async query(vector: number[], topK: number): Promise<RepoVectorMatch[]> {
      return normalizeMatches(
        await index.query(vector, {
          topK: boundedTopK(topK),
          returnValues: false,
          returnMetadata: 'none',
        })
      );
    },
    async queryByRepoId(repoId: number, topK: number): Promise<RepoVectorMatch[]> {
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
  const index = (env as { REPO_VECTORS?: VectorizeIndexLike }).REPO_VECTORS;
  if (!index) throw new Error('Cloudflare Vectorize binding REPO_VECTORS is unavailable');
  return createRepoVectorStore(index);
}
