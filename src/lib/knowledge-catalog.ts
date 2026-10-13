import type { DbClient } from '@/db/client';
import { buildEmbeddingFromRow } from '@/lib/embeddings';
import { catalogIndexPath, knowledgebaseJson, knowledgebaseEmbeddings } from '@/lib/knowledgebase';
import type { RepoVectorInput, RepoVectorMatch } from '@/lib/repo-vectors';
import { enrichProjectContext } from '@/lib/project-context';
import { projectRecommendationFromRow } from '@/lib/connected-projects';

export interface KnowledgeDocument {
  external_id: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeStoredDocument {
  document: { id: string; content: string; metadata: Record<string, unknown> };
  chunks: Array<{ id: string; content: string }>;
}

export function catalogDocument(
  row: Record<string, unknown>,
  sourceText?: string
): KnowledgeDocument {
  const repoId = Number(row.id);
  if (!Number.isSafeInteger(repoId) || repoId < 1) throw new Error('Invalid catalog repository ID');
  return {
    external_id: `repo:${repoId}`,
    content: sourceText || buildEmbeddingFromRow(row).text,
    metadata: {
      schema_version: 1,
      subject_id: `github:${repoId}`,
      repo_id: repoId,
      kind: 'catalog_repo',
      visibility: 'public',
      full_name: row.full_name,
      source_url: `https://github.com/${row.full_name}`,
      ...(row.source_revision ? { source_revision: row.source_revision } : {}),
      source_path: sourceText ? 'public-source-bundle' : 'github-repository-metadata',
      extractor_version: 'starboard-source-v1',
      validation: 'source_observed',
      language: row.language ?? null,
      archived: Number(row.archived ?? 0) === 1,
    },
  };
}

export async function ingestKnowledgeDocuments(documents: KnowledgeDocument[]): Promise<string[]> {
  if (!documents.length) return [];
  const body = await knowledgebaseJson<{ documents: Array<{ document_id: string }> }>(
    `${catalogIndexPath()}/ingest`,
    { documents }
  );
  if (
    !Array.isArray(body.documents) ||
    body.documents.length !== documents.length ||
    body.documents.some((row) => typeof row.document_id !== 'string')
  ) {
    throw new Error('Knowledgebase ingestion response is incomplete');
  }
  return body.documents.map((row) => row.document_id);
}

export async function findKnowledgeDocument(
  externalId: string
): Promise<KnowledgeStoredDocument | null> {
  try {
    return await knowledgebaseJson<KnowledgeStoredDocument>(
      `${catalogIndexPath()}/documents/by-external-id?external_id=${encodeURIComponent(externalId)}`
    );
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('(404)')) return null;
    throw error;
  }
}

interface KnowledgeMatches {
  data: Array<{ score: number; metadata: { repo_id?: unknown } }>;
}

function catalogMatches(body: KnowledgeMatches): Array<{ repoId: number; rankScore: number }> {
  if (!Array.isArray(body.data)) throw new Error('Invalid Knowledgebase catalog response');
  const seen = new Set<number>();
  return body.data.flatMap((match) => {
    const repoId = Number(match.metadata?.repo_id);
    if (
      !Number.isSafeInteger(repoId) ||
      repoId < 1 ||
      seen.has(repoId) ||
      !Number.isFinite(match.score)
    )
      return [];
    seen.add(repoId);
    return [{ repoId, rankScore: match.score }];
  });
}
function repositoryMatches(body: KnowledgeMatches): RepoVectorMatch[] {
  return catalogMatches(body).map(({ repoId, rankScore }) => ({
    repoId,
    distance: Math.max(0, Math.min(1, 1 - rankScore)),
  }));
}

export async function queryKnowledgeCatalog(
  query: string,
  topK = 100,
  includeCapabilities = false
): Promise<Array<{ repoId: number; rankScore: number }>> {
  const kinds = includeCapabilities
    ? ['catalog_repo', 'catalog_capability_card']
    : ['catalog_repo'];
  const results = await Promise.allSettled(
    kinds.map(async (kind) =>
      catalogMatches(
        await knowledgebaseJson<KnowledgeMatches>(`${catalogIndexPath()}/query`, {
          query: query.slice(0, 16_000),
          top_k: Math.min(100, Math.max(1, topK)),
          mode: 'hybrid',
          filter: { kind, visibility: 'public' },
        })
      )
    )
  );
  const arms = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  if (!arms.length) throw new Error('Knowledgebase catalog retrieval is unavailable');
  const matches = new Map<number, { repoId: number; rankScore: number }>();
  const limit = Math.min(100, Math.max(1, topK));
  for (let rank = 0; rank < limit && matches.size < limit; rank++)
    for (const arm of arms) {
      const match = arm[rank];
      if (match && !matches.has(match.repoId)) matches.set(match.repoId, match);
      if (matches.size === limit) break;
    }
  return [...matches.values()];
}

export async function refreshKnowledgeRepository(
  row: Record<string, unknown>,
  sourceText?: string,
  inspectSource = false
) {
  const document = catalogDocument(row, sourceText);
  const previous = await findKnowledgeDocument(document.external_id);
  const context = inspectSource
    ? (await enrichProjectContext(projectRecommendationFromRow({ ...row, tools: '[]' })))
        .sourceContext
    : undefined;
  if (
    context?.documents?.length &&
    context.revision &&
    (context.status === 'complete' || !previous?.document.metadata.source_revision)
  ) {
    document.content = [
      `Repository: ${row.full_name}`,
      ...context.documents.map((source) => `Source: ${source.path}\n${source.text}`),
      `Observed dependencies: ${(context.dependencies || []).join(', ')}`,
    ].join('\n\n');
    document.metadata.source_revision = context.revision;
    document.metadata.source_path = 'public-source-bundle';
    document.metadata.source_paths = context.documents.map((source) => source.path);
    document.metadata.source_status = context.status;
    document.metadata.source_url = `https://github.com/${row.full_name}/tree/${context.revision}`;
  } else if (previous?.document.metadata.source_revision) {
    // A failed/partial refresh preserves the qualified source snapshot.
    document.external_id += ':metadata';
    document.metadata.kind = 'catalog_metadata';
  } else {
    document.metadata.source_status = context?.status || 'unavailable';
  }
  const ids = await ingestKnowledgeDocuments([document]);
  return {
    documentId: ids[0],
    sourceStatus: context?.status || 'unavailable',
    revision: context?.revision || null,
    retainedPrevious: document.external_id.endsWith(':metadata'),
  };
}

export function createKnowledgebaseRepoVectorStore(database: Pick<DbClient, 'execute'>) {
  return {
    // The service owns admission. These local receipts only preserve the old interface.
    async reserveStorage(_count: number) {
      return Symbol('knowledgebase-storage');
    },
    async reserveQuery(_dimensions = 768) {
      return Symbol('knowledgebase-query');
    },
    async query(vector: number[], topK: number, _admitted?: symbol) {
      return repositoryMatches(
        await knowledgebaseJson<KnowledgeMatches>(`${catalogIndexPath()}/query-vector`, {
          vector,
          top_k: Math.min(100, Math.max(1, topK)),
          filter: { kind: 'catalog_repo', visibility: 'public' },
        })
      );
    },
    async queryByRepoId(repoId: number, topK: number) {
      const stored = await findKnowledgeDocument(`repo:${repoId}`);
      if (!stored) return [];
      const [vector] = await knowledgebaseEmbeddings([stored.document.content.slice(0, 10_000)]);
      return repositoryMatches(
        await knowledgebaseJson<KnowledgeMatches>(`${catalogIndexPath()}/query-vector`, {
          vector,
          top_k: Math.min(100, Math.max(1, topK)),
          filter: { kind: 'catalog_repo', visibility: 'public' },
        })
      );
    },
    async upsert(vectors: RepoVectorInput[], _admitted?: symbol) {
      if (!vectors.length) return;
      const result = await database.execute({
        sql: 'SELECT * FROM repos WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))',
        args: [JSON.stringify(vectors.map((row) => row.repoId))],
      });
      if (result.rows.length !== new Set(vectors.map((row) => row.repoId)).size)
        throw new Error('Knowledgebase writes require catalog membership');
      // Send source text; Knowledgebase owns embeddings and their storage lifecycle.
      const textById = new Map(vectors.map((row) => [row.repoId, row.content]));
      for (const row of result.rows)
        await refreshKnowledgeRepository(row, textById.get(Number(row.id)));
    },
  };
}
