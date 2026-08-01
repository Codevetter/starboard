import type { RepoVectorInput } from './repo-vectors';

interface VectorizeRestConfig {
  accountId: string;
  indexName: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}

interface VectorizeApiResponse {
  success: boolean;
  errors?: Array<{ message?: string }>;
}

export function createVectorizeRestWriter(config: VectorizeRestConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/vectorize/v2/indexes/${config.indexName}/upsert?unparsable-behavior=error`;

  return {
    async upsert(vectors: RepoVectorInput[]): Promise<void> {
      if (vectors.length === 0) return;
      const body = vectors
        .map((vector) =>
          JSON.stringify({
            id: String(vector.repoId),
            values: vector.values,
            metadata: { repoId: vector.repoId },
          })
        )
        .join('\n');
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/x-ndjson',
        },
        body,
      });
      const payload = (await response.json()) as VectorizeApiResponse;
      if (!response.ok || !payload.success) {
        const message = payload.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join('; ');
        throw new Error(message || `Vectorize API request failed with status ${response.status}`);
      }
    },
  };
}

export function createVectorizeRestWriterFromEnv() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const indexName = process.env.VECTORIZE_INDEX_NAME || 'starboard-repos';
  if (!accountId || !apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
  }
  return createVectorizeRestWriter({ accountId, indexName, apiToken });
}
