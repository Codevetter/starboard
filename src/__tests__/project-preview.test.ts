import { describe, expect, it, vi } from 'vitest';

import type { DbResult } from '@/db/client';
import { createProjectPreviewResolver } from '@/lib/project-preview';

function result(rows: Record<string, unknown>[]): DbResult {
  return { rows, columns: [], rowsAffected: 0, lastInsertRowid: null };
}

describe('public project preview resolution', () => {
  it('rejects invalid input before reading the catalog or GitHub', async () => {
    const execute = vi.fn();
    const fetchProject = vi.fn();
    const resolve = createProjectPreviewResolver({ database: { execute }, fetchProject });

    await expect(resolve('not-a-repository')).resolves.toEqual({ status: 'invalid' });
    expect(execute).not.toHaveBeenCalled();
    expect(fetchProject).not.toHaveBeenCalled();
  });

  it('uses enriched catalog context without an external GitHub request', async () => {
    const execute = vi.fn().mockResolvedValue(
      result([
        {
          id: 1,
          name: 'openai-node',
          full_name: 'openai/openai-node',
          html_url: 'https://github.com/openai/openai-node',
          description: 'Official SDK',
          language: 'TypeScript',
          stargazers_count: 10_000,
          archived: 0,
          topics: '["openai"]',
          ai_summary: 'Typed SDK',
          ai_category: 'sdk',
          ai_keywords: '["api"]',
          tools: '[{"key":"vitest","name":"Vitest","category":"testing","confidence":95}]',
        },
      ])
    );
    const fetchProject = vi.fn();
    const resolve = createProjectPreviewResolver({ database: { execute }, fetchProject });

    await expect(resolve('openai/openai-node')).resolves.toMatchObject({
      status: 'resolved',
      source: 'catalog',
      project: { fullName: 'openai/openai-node', tools: [{ key: 'vitest' }] },
    });
    expect(fetchProject).not.toHaveBeenCalled();
  });

  it('resolves one public GitHub repository on a catalog miss without persisting it', async () => {
    const execute = vi.fn().mockResolvedValue(result([]));
    const fetchProject = vi.fn().mockResolvedValue({
      id: 2,
      name: 'sdk',
      fullName: 'acme/sdk',
      ownerLogin: 'acme',
      ownerAvatar: '',
      htmlUrl: 'https://github.com/acme/sdk',
      description: 'SDK',
      language: 'Go',
      stargazersCount: 50,
      archived: false,
      topics: ['sdk'],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const resolve = createProjectPreviewResolver({ database: { execute }, fetchProject });

    await expect(resolve('acme/sdk')).resolves.toMatchObject({
      status: 'resolved',
      source: 'github',
      project: { id: 2, fullName: 'acme/sdk', tools: [] },
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fetchProject).toHaveBeenCalledTimes(1);
  });
});
