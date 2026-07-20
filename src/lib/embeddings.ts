/**
 * Embedding dimension contract.
 *
 * The model below must produce EMBEDDING_DIM-sized vectors. Three places track this:
 *   1. EMBEDDING_DIM here.
 *   2. F32_BLOB(<dim>) in src/db/schema.sql (column + libsql_vector_idx).
 *   3. The self-heal check in src/db/migrate.ts that drops + recreates repo_embeddings
 *      when the live table's dimension drifts.
 *
 * Changing the model requires updating all three together. See agents.md ›
 * "Embedding dimension contract".
 */
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBEDDING_DIM = 768;
const BATCH_SIZE = 50;

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

interface AiBinding {
  run(model: string, input: { text: string[] }): Promise<{ data: number[][] }>;
}

// Errors thrown by the Workers AI binding don't always carry an HTTP status.
// Detect rate-limit / overload signals from the message too so we can back off.
function isRetryableBindingError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const status = (err as { status?: number }).status;
    if (status === 429 || (typeof status === 'number' && status >= 500)) return true;
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    msg.includes('rate') ||
    msg.includes('429') ||
    msg.includes('overload') ||
    msg.includes('too many requests') ||
    msg.includes('busy') ||
    msg.includes('capacity')
  );
}

export { EMBEDDING_DIM };

interface RepoAiMetadataInput {
  summary?: string | null;
  category?: string | null;
  subcategories?: string | string[] | null;
  use_cases?: string | string[] | null;
  keywords?: string | string[] | null;
}

/**
 * In Workers context (opennext), pull the direct AI binding.
 * Returns null when running in Node CLI (e.g. seed scripts) — caller falls
 * back to the HTTP gateway path.
 */
async function getAiBinding(): Promise<AiBinding | null> {
  try {
    const mod = await import('@opennextjs/cloudflare');
    const ctx = mod.getCloudflareContext();
    return (ctx.env as { AI?: AiBinding }).AI ?? null;
  } catch {
    return null;
  }
}

const MAX_EMBED_ATTEMPTS = 3;
// Pause between consecutive batches so a sync of N repos doesn't fire
// N/50 binding calls in a tight loop — that burst is what trips Workers AI
// rate limiting. 200ms keeps a 500-repo sync under ~2s of added wall time
// while staying well under the per-minute request ceiling.
const INTER_BATCH_DELAY_MS = 200;

async function embedViaBinding(ai: AiBinding, texts: string[]): Promise<number[][]> {
  // Mirror embedViaHttp: 3 attempts, exponential backoff with jitter.
  // The Workers AI binding throws on 429/overload; without this, a single
  // rate-limited batch fails the whole sync/discover request.
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_EMBED_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await delay(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
    }
    try {
      const res = await ai.run(EMBEDDING_MODEL, { text: texts });
      return res.data;
    } catch (err) {
      lastError = err;
      if (isRetryableBindingError(err) && attempt < MAX_EMBED_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  throw lastError ?? new Error('Binding embedding failed after retries');
}

function isRetryableStatus(status: number): boolean {
  // 429 (rate limit) + 5xx are transient and worth retrying.
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedViaHttp(texts: string[]): Promise<number[][]> {
  const url = process.env.AI_GATEWAY_URL;
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!url || !key) {
    throw new Error('No AI binding available and AI_GATEWAY_URL/AI_GATEWAY_API_KEY not set');
  }

  // Exponential backoff — transient gateway downtime shouldn't break search.
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_EMBED_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await delay(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
    }
    try {
      const res = await fetch(`${url}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'x-gateway-project-id': 'starboard',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
          dimensions: EMBEDDING_DIM,
        }),
      });
      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < MAX_EMBED_ATTEMPTS - 1) {
          lastError = new Error(`Embedding API error ${res.status}`);
          continue;
        }
        throw new Error(`Embedding API error ${res.status}: ${await res.text()}`);
      }
      const json: EmbeddingResponse = await res.json();
      const out: number[][] = new Array(texts.length);
      for (const item of json.data) out[item.index] = item.embedding;
      return out;
    } catch (err) {
      lastError = err;
      if (attempt === MAX_EMBED_ATTEMPTS - 1) throw err;
    }
  }
  throw lastError ?? new Error('Embedding request failed after retries');
}

/** Build the text we embed for a repo — cheap, no extra API calls. */
export function buildRepoEmbeddingText(repo: {
  full_name: string;
  description: string | null;
  language: string | null;
  topics: string | string[];
  ai?: RepoAiMetadataInput | null;
}): string {
  const parts = [repo.full_name.replace('/', ' ')];
  if (repo.description) parts.push(repo.description);
  if (repo.language) parts.push(repo.language);
  const topics = typeof repo.topics === 'string' ? JSON.parse(repo.topics) : repo.topics;
  if (topics?.length) parts.push(topics.join(', '));
  if (repo.ai) {
    if (repo.ai.summary) parts.push(repo.ai.summary);
    if (repo.ai.category) parts.push(repo.ai.category);
    const subcategories = parseStringList(repo.ai.subcategories);
    if (subcategories.length) parts.push(subcategories.join(', '));
    const useCases = parseStringList(repo.ai.use_cases);
    if (useCases.length) parts.push(useCases.join(', '));
    const keywords = parseStringList(repo.ai.keywords);
    if (keywords.length) parts.push(keywords.join(', '));
  }
  return parts.join(' | ');
}

function parseStringList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Simple hash to detect when repo text changes. */
export function textHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function normalizeEmbeddingDimensions(vec: number[]): number[] {
  if (vec.length === EMBEDDING_DIM) return vec;
  if (vec.length > EMBEDDING_DIM && vec.length % EMBEDDING_DIM === 0) {
    const factor = vec.length / EMBEDDING_DIM;
    const reduced = new Array<number>(EMBEDDING_DIM);
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      let sum = 0;
      for (let j = 0; j < factor; j++) sum += vec[i * factor + j] ?? 0;
      reduced[i] = sum / factor;
    }
    return reduced;
  }
  return vec;
}

/**
 * Generate embeddings for one or more texts.
 * Prefers the direct CF Workers AI binding (when running inside a Worker via
 * opennext); falls back to the AI Gateway HTTP path otherwise (Node CLI scripts).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const ai = await getAiBinding();
  const results: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    if (i > 0) await delay(INTER_BATCH_DELAY_MS);
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = ai ? await embedViaBinding(ai, batch) : await embedViaHttp(batch);
    for (let j = 0; j < embeddings.length; j++) {
      const vec = normalizeEmbeddingDimensions(embeddings[j]);
      if (vec.length !== EMBEDDING_DIM) {
        throw new Error(
          `Embedding dimension mismatch: model "${EMBEDDING_MODEL}" returned ${vec.length}, expected ${EMBEDDING_DIM}. Update EMBEDDING_DIM, schema.sql, and the migrate.ts self-heal check together.`
        );
      }
      results[i + j] = vec;
    }
  }

  return results;
}

/** LRU cache for query embeddings — avoids re-embedding the same search query. */
const CACHE_MAX = 100;
const embeddingCache = new Map<string, number[]>();

/** Convenience: embed a single text (e.g. a search query). Cached. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase();
  const cached = embeddingCache.get(key);
  if (cached) return cached;

  const [embedding] = await generateEmbeddings([key]);

  // Evict oldest if at capacity
  if (embeddingCache.size >= CACHE_MAX) {
    const oldest = embeddingCache.keys().next().value!;
    embeddingCache.delete(oldest);
  }
  embeddingCache.set(key, embedding);

  return embedding;
}

/** Cosine similarity for two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
