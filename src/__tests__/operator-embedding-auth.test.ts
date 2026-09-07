import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execute, queryByRepoId, generateEmbeddings } = vi.hoisted(() => ({
  execute: vi.fn(),
  queryByRepoId: vi.fn(),
  generateEmbeddings: vi.fn(),
}));
vi.mock('@/db', () => ({ db: { execute } }));
vi.mock('@/lib/repo-vectors', () => ({ repoVectors: () => ({ queryByRepoId }) }));
vi.mock('@/lib/embeddings', () => ({ buildEmbeddingFromRow: vi.fn(), generateEmbeddings }));

import { GET, POST } from '@/app/api/internal/embed-pending/route';

describe('embedding operator route credential boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('STARBOARD_OPERATOR_TOKEN', 'synthetic-operator');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'synthetic-gateway');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([GET, POST])(
    'rejects the gateway credential before any data or embedding work',
    async (handler) => {
      const response = await handler(
        new Request('https://starboard.test/api/internal/embed-pending', {
          headers: { Authorization: 'Bearer synthetic-gateway' },
        })
      );
      expect(response.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
      expect(generateEmbeddings).not.toHaveBeenCalled();
      expect(queryByRepoId).not.toHaveBeenCalled();
    }
  );

  it('does not fall back to the gateway key when operator auth is unconfigured', async () => {
    vi.stubEnv('STARBOARD_OPERATOR_TOKEN', '');
    const response = await GET(
      new Request('https://starboard.test/api/internal/embed-pending', {
        headers: { Authorization: 'Bearer synthetic-gateway' },
      })
    );
    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it('allows the dedicated token to reach the read-only binding probe', async () => {
    execute.mockResolvedValue({ rows: [{ repo_id: 42 }] });
    queryByRepoId.mockResolvedValue([]);
    const response = await GET(
      new Request('https://starboard.test/api/internal/embed-pending', {
        headers: { Authorization: 'Bearer synthetic-operator' },
      })
    );
    expect(response.status).toBe(200);
    expect(queryByRepoId).toHaveBeenCalledWith(42, 1);
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });
});
