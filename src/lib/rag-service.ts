import { getCloudflareContext } from "@opennextjs/cloudflare";

type ServiceBinding = {
  fetch(request: Request): Promise<Response>;
};

interface RagResult {
  document_id: string;
  chunk_id: string;
  chunk_content: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface RagDocument {
  content: string;
  metadata: Record<string, unknown>;
}

const RAG_SERVICE_URL =
  process.env.RAG_SERVICE_URL || "https://knowledgebase.sarthakagrawal927.workers.dev";

function serviceKey(): string {
  return process.env.RAG_SERVICE_KEY?.trim() || "";
}

function indexId(): string {
  return process.env.STARBOARD_RAG_INDEX_ID?.trim() || "";
}

function serviceBinding(): ServiceBinding | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { RAG_SERVICE?: ServiceBinding }).RAG_SERVICE ?? null;
  } catch {
    return null;
  }
}

export function isRagServiceConfigured(): boolean {
  return Boolean(serviceKey() && indexId());
}

async function ragFetch(path: string, init: RequestInit): Promise<Response> {
  const key = serviceKey();
  if (!key) throw new Error("RAG_SERVICE_KEY is not configured");
  const requestInit: RequestInit = {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  };
  const binding = serviceBinding();
  if (binding) return binding.fetch(new Request(`https://knowledgebase.internal${path}`, requestInit));
  return fetch(`${RAG_SERVICE_URL.replace(/\/+$/, "")}${path}`, requestInit);
}

export async function searchStarboardRag(userId: string, query: string, topK: number): Promise<number[] | null> {
  const ragIndexId = indexId();
  if (!serviceKey() || !ragIndexId) return null;
  const res = await ragFetch(`/v1/indexes/${ragIndexId}/query`, {
    method: "POST",
    body: JSON.stringify({
      query,
      top_k: topK,
      mode: "semantic",
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

export async function ingestStarboardRagDocuments(documents: RagDocument[]): Promise<number> {
  const ragIndexId = indexId();
  if (!serviceKey() || !ragIndexId || documents.length === 0) return 0;
  const res = await ragFetch(`/v1/indexes/${ragIndexId}/ingest`, {
    method: "POST",
    body: JSON.stringify({ documents }),
  });
  if (!res.ok) throw new Error(`RAG ingest failed ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { documents?: unknown[] };
  return body.documents?.length ?? 0;
}
