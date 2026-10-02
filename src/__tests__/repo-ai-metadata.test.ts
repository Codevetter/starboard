import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAiBinding: vi.fn(),
}));

vi.mock('@/lib/embeddings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/embeddings')>()),
  getAiBinding: mocks.getAiBinding,
}));

import {
  buildRepoAiMetadataPrompt,
  buildRepoAiSourceText,
  generateRepoAiMetadata,
  inferRepoAiMetadata,
  normalizeRepoAiMetadata,
  repoAiSourceHash,
} from '@/lib/repo-ai-metadata';

const repo = {
  full_name: 'promptfoo/promptfoo',
  description: 'Test your prompts, agents, and RAGs',
  language: 'TypeScript',
  topics: ['evals', 'llm', 'testing'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAiBinding.mockResolvedValue(null);
});

describe('repo AI metadata helpers', () => {
  it('builds compact source text from repo metadata', () => {
    const text = buildRepoAiSourceText(repo);

    expect(text).toContain('name: promptfoo/promptfoo');
    expect(text).toContain('description: Test your prompts');
    expect(text).toContain('topics: evals, llm, testing');
  });

  it('hashes source text deterministically', () => {
    expect(repoAiSourceHash(repo)).toBe(repoAiSourceHash(repo));
  });

  it('builds a JSON-only classification prompt', () => {
    const prompt = buildRepoAiMetadataPrompt(repo);

    expect(prompt).toContain('Return only compact JSON');
    expect(prompt).toContain('ai-evals');
    expect(prompt).toContain('promptfoo/promptfoo');
  });

  it('normalizes model output to bounded metadata', () => {
    const normalized = normalizeRepoAiMetadata({
      summary: ' A useful LLM eval platform. ',
      category: 'ai-evals',
      subcategories: ['Prompt Testing', 'Prompt Testing', 'RAG!!!'],
      use_cases: ['Evaluate prompts', 123, 'Compare models'],
      keywords: Array.from({ length: 20 }, (_, i) => `keyword-${i}`),
    });

    expect(normalized.summary).toBe('A useful LLM eval platform.');
    expect(normalized.category).toBe('ai-evals');
    expect(normalized.subcategories).toEqual(['prompt testing', 'rag']);
    expect(normalized.use_cases).toEqual(['evaluate prompts', 'compare models']);
    expect(normalized.keywords).toHaveLength(10);
  });

  it('falls back for invalid categories', () => {
    const normalized = normalizeRepoAiMetadata({ category: 'magic' });

    expect(normalized.category).toBe('unknown');
  });

  it('infers eval taxonomy without a model call', () => {
    const metadata = inferRepoAiMetadata(repo);

    expect(metadata.category).toBe('ai-evals');
    expect(metadata.keywords).toContain('evals');
    expect(metadata.use_cases).toContain('evaluate prompts');
  });

  it('fails closed for the unpriced metadata model before calling Workers AI', async () => {
    const ai = { run: vi.fn() };
    const budget = {
      idFromName: vi.fn(),
      get: vi.fn(),
    };
    mocks.getAiBinding.mockResolvedValue({ ai, budget });

    await expect(generateRepoAiMetadata(repo)).rejects.toThrow('Shared AI budget');

    expect(ai.run).not.toHaveBeenCalled();
    expect(budget.idFromName).not.toHaveBeenCalled();
  });
});
