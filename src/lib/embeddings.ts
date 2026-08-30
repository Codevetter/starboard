import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany } from 'ai';

/**
 * Embedding dimension contract.
 *
 * The model below must produce EMBEDDING_DIM-sized vectors. The Cloudflare
 * Vectorize index `starboard-repos` is created with the same dimension and the
 * cosine metric. Changing the model requires recreating that index deliberately.
 *
 * See agents.md ›
 * "Embedding dimension contract".
 */
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBEDDING_DIM = 768;
const BATCH_SIZE = 50;

export interface AiBinding {
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
 * back to an explicitly configured direct provider/local endpoint.
 */
export async function getAiBinding(): Promise<AiBinding | null> {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedViaHttp(texts: string[]): Promise<number[][]> {
  const url = process.env.AI_BASE_URL;
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_EMBED_MODEL;
  if (!url || !key || !model) {
    throw new Error(
      'No AI binding available and AI_BASE_URL/AI_API_KEY/AI_EMBED_MODEL are not set'
    );
  }

  const provider = createOpenAICompatible({
    name: 'starboard-direct',
    baseURL: url.replace(/\/+$/, ''),
    apiKey: key,
  });

  // Exponential backoff — transient provider downtime shouldn't break search.
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_EMBED_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await delay(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
    }
    try {
      const result = await embedMany({
        model: provider.embeddingModel(model),
        values: texts,
        maxRetries: 0,
      });
      return result.embeddings;
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

/**
 * Build embedding text + hash from a D1 repo row. Consolidates the identical
 * row-to-text mapping used by the embed-pending route, seed-embeddings, and
 * seed-popular jobs. The row is `Record<string, unknown>` because D1 returns
 * untyped rows; casts happen once inside the helper.
 */
export function buildEmbeddingFromRow(row: Record<string, unknown>): {
  text: string;
  hash: string;
} {
  const text = buildRepoEmbeddingText({
    full_name: row.full_name as string,
    description: row.description as string | null,
    language: row.language as string | null,
    topics: row.topics as string,
    ai: row.summary
      ? {
          summary: row.summary as string,
          category: row.category as string,
          subcategories: row.subcategories as string,
          use_cases: row.use_cases as string,
          keywords: row.keywords as string,
        }
      : null,
  });
  return { text, hash: textHash(text) };
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
 * opennext); falls back to a direct configured endpoint otherwise (Node CLI scripts).
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
          `Embedding dimension mismatch: model "${EMBEDDING_MODEL}" returned ${vec.length}, expected ${EMBEDDING_DIM}. Update EMBEDDING_DIM and recreate the Vectorize index together.`
        );
      }
      results[i + j] = vec;
    }
  }

  return results;
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
