import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getFreeAiBinding: vi.fn() }));

vi.mock('@/lib/embeddings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/embeddings')>()),
  getFreeAiBinding: mocks.getFreeAiBinding,
}));

import { generateRepoAiMetadata } from '@/lib/repo-ai-metadata';

describe('Starboard metadata gateway admission', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('makes one private gateway call and delegates the sole neuron reservation centrally', async () => {
    vi.stubEnv('AI_BASE_URL', 'https://configured-direct.example/v1');
    vi.stubEnv('AI_API_KEY', 'synthetic-test-key');
    vi.stubEnv('AI_MODEL', 'configured-direct-model');
    const requests: Request[] = [];
    const gateway = {
      run: vi.fn(),
      fetch: vi.fn(async (request: Request) => {
        requests.push(request);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'A repository tool.',
                  category: 'devtool',
                  subcategories: ['testing'],
                  use_cases: ['test software'],
                  keywords: ['testing'],
                }),
              },
            },
          ],
        });
      }),
    };
    mocks.getFreeAiBinding.mockResolvedValue(gateway);

    const result = await generateRepoAiMetadata({
      full_name: 'acme/tool',
      description: 'A test tool',
      language: 'TypeScript',
      topics: ['testing'],
    });

    expect(result.model).toBe('auto');
    expect(gateway.fetch).toHaveBeenCalledTimes(1);
    expect(gateway.run).not.toHaveBeenCalled();
    expect(requests[0]?.headers.get('x-gateway-project-id')).toBe('starboard');
  });
});
