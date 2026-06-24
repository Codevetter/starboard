import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildRepoEmbeddingText,
  EMBEDDING_DIM,
  generateEmbeddings,
  textHash,
} from '@/lib/embeddings';

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env.AI_GATEWAY_URL;
  delete process.env.AI_GATEWAY_API_KEY;
});

describe('embedding dimension contract', () => {
  it('schema.sql repo_embeddings column matches EMBEDDING_DIM', () => {
    const schema = readFileSync(join(process.cwd(), 'src/db/schema.sql'), 'utf-8');
    const match = schema.match(
      /CREATE TABLE IF NOT EXISTS repo_embeddings[\s\S]*?embedding\s+F32_BLOB\((\d+)\)/
    );
    expect(match, 'repo_embeddings F32_BLOB declaration not found').not.toBeNull();
    expect(parseInt(match![1], 10)).toBe(EMBEDDING_DIM);
  });

  it('migrate.ts self-heal references EMBEDDING_DIM', () => {
    const migrate = readFileSync(join(process.cwd(), 'src/db/migrate.ts'), 'utf-8');
    expect(migrate).toContain('EMBEDDING_DIM');
    expect(migrate).toContain('ensureEmbeddingDimension');
  });

  it('requests the configured embedding dimension from the HTTP gateway', async () => {
    process.env.AI_GATEWAY_URL = 'https://ai-gateway.example.test';
    process.env.AI_GATEWAY_API_KEY = 'test-key';
    const embedding = Array.from({ length: EMBEDDING_DIM }, () => 0.1);
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ data: [{ embedding, index: 0 }] })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await generateEmbeddings(['repo text']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toMatchObject({
      input: ['repo text'],
      dimensions: EMBEDDING_DIM,
    });
  });

  it('normalizes oversized HTTP gateway embeddings to the schema dimension', async () => {
    process.env.AI_GATEWAY_URL = 'https://ai-gateway.example.test';
    process.env.AI_GATEWAY_API_KEY = 'test-key';
    const embedding = Array.from({ length: EMBEDDING_DIM * 4 }, (_, index) => index);
    globalThis.fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ data: [{ embedding, index: 0 }] })
    ) as typeof fetch;

    const [normalized] = await generateEmbeddings(['repo text']);

    expect(normalized).toHaveLength(EMBEDDING_DIM);
    expect(normalized[0]).toBe(1.5);
    expect(normalized[1]).toBe(5.5);
  });
});

describe('buildRepoEmbeddingText', () => {
  it('includes all repo fields separated by pipes', () => {
    const text = buildRepoEmbeddingText({
      full_name: 'facebook/react',
      description: 'A JavaScript library for building UIs',
      language: 'JavaScript',
      topics: ['react', 'frontend', 'ui'],
    });
    expect(text).toBe(
      'facebook react | A JavaScript library for building UIs | JavaScript | react, frontend, ui'
    );
  });

  it('handles null description and language', () => {
    const text = buildRepoEmbeddingText({
      full_name: 'user/repo',
      description: null,
      language: null,
      topics: [],
    });
    expect(text).toBe('user repo');
  });

  it('parses JSON string topics', () => {
    const text = buildRepoEmbeddingText({
      full_name: 'user/repo',
      description: 'desc',
      language: null,
      topics: '["a","b"]',
    });
    expect(text).toBe('user repo | desc | a, b');
  });

  it('includes AI metadata when available', () => {
    const text = buildRepoEmbeddingText({
      full_name: 'promptfoo/promptfoo',
      description: 'Test your prompts',
      language: 'TypeScript',
      topics: ['evals'],
      ai: {
        summary: 'LLM evaluation framework.',
        category: 'ai-evals',
        subcategories: ['prompt testing'],
        use_cases: ['evaluate prompts'],
        keywords: ['evals', 'promptfoo', 'llm testing'],
      },
    });

    expect(text).toContain('LLM evaluation framework.');
    expect(text).toContain('ai-evals');
    expect(text).toContain('prompt testing');
    expect(text).toContain('llm testing');
  });
});

describe('textHash', () => {
  it('returns consistent hash for same input', () => {
    const h1 = textHash('hello world');
    const h2 = textHash('hello world');
    expect(h1).toBe(h2);
  });

  it('returns different hash for different input', () => {
    const h1 = textHash('hello');
    const h2 = textHash('world');
    expect(h1).not.toBe(h2);
  });
});
