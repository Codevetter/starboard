import { getCloudflareContext } from '@opennextjs/cloudflare';

type ServiceBinding = {
  fetch(request: Request): Promise<Response>;
};

type CloudflareEnv = {
  RAG_SERVICE?: ServiceBinding;
  RAG_SERVICE_KEY?: string;
  STARBOARD_RAG_INDEX_ID?: string;
  STARBOARD_CATALOG_INDEX_ID?: string;
  STARBOARD_KNOWLEDGE_PIPELINE?: string;
};

interface RagResult {
  document_id: string;
  chunk_id: string;
  chunk_content: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface RagDocument {
  external_id?: string;
  content: string;
  metadata: Record<string, unknown>;
}

const RAG_SERVICE_URL =
  process.env.RAG_SERVICE_URL || 'https://knowledgebase.sarthakagrawal927.workers.dev';
const DEFAULT_RAG_INGEST_BATCH_BYTES = 750_000;

function cloudflareEnv(): CloudflareEnv {
  try {
    const { env } = getCloudflareContext();
    return env as CloudflareEnv;
  } catch {
    return {};
  }
}

function serviceKey(): string {
  return process.env.RAG_SERVICE_KEY?.trim() || cloudflareEnv().RAG_SERVICE_KEY?.trim() || '';
}

function indexId(): string {
  return (
    process.env.STARBOARD_RAG_INDEX_ID?.trim() ||
    cloudflareEnv().STARBOARD_RAG_INDEX_ID?.trim() ||
    ''
  );
}

function serviceBinding(): ServiceBinding | null {
  return cloudflareEnv().RAG_SERVICE ?? null;
}

async function knowledgebaseFetch(path: string, init: RequestInit): Promise<Response> {
  const key = serviceKey();
  if (!key) throw new Error('RAG_SERVICE_KEY is not configured');
  const requestInit: RequestInit = {
    signal: AbortSignal.timeout(60_000),
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  };
  const binding = serviceBinding();
  if (binding)
    return binding.fetch(new Request(`https://knowledgebase.internal${path}`, requestInit));
  return fetch(`${RAG_SERVICE_URL.replace(/\/+$/, '')}${path}`, requestInit);
}

async function searchStarboardRag(
  userId: string,
  query: string,
  topK: number
): Promise<number[] | null> {
  const ragIndexId = indexId();
  if (!serviceKey() || !ragIndexId) {
    if (knowledgePipelineEnabled())
      throw new Error('The personal Knowledgebase index is not configured');
    return null;
  }
  const res = await knowledgebaseFetch(`/v1/indexes/${encodeURIComponent(ragIndexId)}/query`, {
    method: 'POST',
    body: JSON.stringify({
      query,
      top_k: topK,
      mode: knowledgePipelineEnabled() ? 'hybrid' : 'semantic',
      filter: { user_id: userId },
    }),
  });
  if (!res.ok) throw new Error(`RAG search failed ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { data?: RagResult[] };
  const ids = (body.data ?? [])
    .map((result) => Number(result.metadata.repo_id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
}

export async function searchStarboardRagOrEmpty(
  userId: string,
  query: string,
  topK: number
): Promise<number[]> {
  try {
    return (await searchStarboardRag(userId, query, topK)) ?? [];
  } catch (error) {
    if (knowledgePipelineEnabled()) throw error;
    console.warn('knowledgebase RAG search failed:', error);
    return [];
  }
}

export async function ingestStarboardRagDocuments(documents: RagDocument[]): Promise<number> {
  const ragIndexId = indexId();
  if (!serviceKey() || !ragIndexId || documents.length === 0) return 0;
  let ingested = 0;
  for (const batch of batchRagDocuments(documents)) {
    const res = await knowledgebaseFetch(`/v1/indexes/${encodeURIComponent(ragIndexId)}/ingest`, {
      method: 'POST',
      body: JSON.stringify({ documents: batch }),
    });
    if (!res.ok) throw new Error(`RAG ingest failed ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { documents?: unknown[] };
    ingested += body.documents?.length ?? 0;
  }
  return ingested;
}

/** Explicit cutover after source reconciliation; never silently select a partial index. */
export function knowledgePipelineEnabled(): boolean {
  return (
    (process.env.STARBOARD_KNOWLEDGE_PIPELINE || cloudflareEnv().STARBOARD_KNOWLEDGE_PIPELINE) ===
    'knowledgebase'
  );
}

export function personalIndexPath(): string {
  const id = indexId();
  if (!id) throw new Error('STARBOARD_RAG_INDEX_ID is not configured');
  return `/v1/indexes/${encodeURIComponent(id)}`;
}

export function catalogIndexPath(): string {
  const id =
    process.env.STARBOARD_CATALOG_INDEX_ID?.trim() ||
    cloudflareEnv().STARBOARD_CATALOG_INDEX_ID?.trim();
  if (!id) throw new Error('STARBOARD_CATALOG_INDEX_ID is not configured');
  return `/v1/indexes/${encodeURIComponent(id)}`;
}

export async function knowledgebaseJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await knowledgebaseFetch(
    path,
    body === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(body) }
  );
  if (!response.ok) throw new Error(`Knowledgebase request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function knowledgebaseEmbeddings(input: string[]): Promise<number[][]> {
  const result = await knowledgebaseJson<{ data: number[][]; dimensions: number }>(
    '/v1/embeddings',
    {
      input,
      dimensions: 768,
      model: '@cf/baai/bge-base-en-v1.5',
    }
  );
  if (
    result.dimensions !== 768 ||
    !Array.isArray(result.data) ||
    result.data.length !== input.length ||
    result.data.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== 768 ||
        row.some((value) => typeof value !== 'number' || !Number.isFinite(value))
    )
  ) {
    throw new Error('Knowledgebase embedding response violates the 768-dimensional contract');
  }
  return result.data;
}

export function batchRagDocuments(
  documents: RagDocument[],
  maxBytes = DEFAULT_RAG_INGEST_BATCH_BYTES
): RagDocument[][] {
  const batches: RagDocument[][] = [];
  let current: RagDocument[] = [];
  let currentBytes = JSON.stringify({ documents: [] }).length;

  for (const document of documents) {
    const documentBytes = JSON.stringify(document).length + 1;
    if (current.length > 0 && currentBytes + documentBytes > maxBytes) {
      batches.push(current);
      current = [];
      currentBytes = JSON.stringify({ documents: [] }).length;
    }
    current.push(document);
    currentBytes += documentBytes;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}
