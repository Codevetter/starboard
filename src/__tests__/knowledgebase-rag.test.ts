import { describe, expect, it } from 'vitest';

import { batchRagDocuments } from '@/lib/knowledgebase';
import { buildStarboardRagDocument, fetchRepoReadmes } from '@/lib/starboard-rag-documents';

const repo = {
  id: 42,
  full_name: 'acme/widgets',
  description: 'Widget framework',
  language: 'TypeScript',
  stargazers_count: 123,
  topics: ['widgets', 'ui'],
};

describe('Starboard knowledgebase RAG documents', () => {
  it('includes README content and searchable repo metadata', () => {
    const document = buildStarboardRagDocument(
      'user-1',
      repo,
      '# Widgets\n\nSupports adapters, recipes, and plugin APIs.'
    );

    expect(document.content).toContain('Repository: acme/widgets');
    expect(document.content).toContain('Widget framework');
    expect(document.content).toContain('README:');
    expect(document.content).toContain('plugin APIs');
    expect(document.metadata).toMatchObject({
      user_id: 'user-1',
      repo_id: 42,
      full_name: 'acme/widgets',
      language: 'TypeScript',
      has_readme: true,
      source: 'github_readme',
    });
  });

  it('keeps README-only terms recallable through bounded ingest batches', () => {
    const readmeOnlyNeedle = 'holographic scheduler webhooks';
    const document = buildStarboardRagDocument(
      'user-1',
      repo,
      [
        '# Widgets',
        '',
        'The README documents adapters, recipes, plugin APIs, and holographic scheduler webhooks.',
        'This phrase is intentionally absent from the GitHub repository description.',
      ].join('\n')
    );
    const distractor = buildStarboardRagDocument(
      'user-1',
      {
        ...repo,
        id: 43,
        full_name: 'acme/other',
        description: 'Unrelated repository metadata',
        topics: ['search'],
      },
      null
    );

    const batches = batchRagDocuments([document, distractor], 420);
    const recallHits = batches
      .flat()
      .filter((candidate) =>
        readmeOnlyNeedle.split(' ').every((term) => candidate.content.toLowerCase().includes(term))
      );

    expect(batches.length).toBeGreaterThan(1);
    expect(recallHits).toHaveLength(1);
    expect(recallHits[0]?.metadata).toMatchObject({
      repo_id: 42,
      has_readme: true,
      source: 'github_readme',
    });
  });

  it('falls back to repo metadata when README is unavailable', () => {
    const document = buildStarboardRagDocument('user-1', repo, null);

    expect(document.content).toContain('Repository: acme/widgets');
    expect(document.content).not.toContain('README:');
    expect(document.metadata).toMatchObject({
      has_readme: false,
      source: 'github_repo_metadata',
    });
  });

  it('fetches available READMEs and skips missing repos', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      calls.push(href);
      if (href.endsWith('/acme/widgets/readme')) return new Response('# Widgets');
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const readmes = await fetchRepoReadmes(
      'github-token',
      [repo, { ...repo, id: 43, full_name: 'acme/missing' }],
      { fetchImpl, concurrency: 2 }
    );

    expect(readmes).toEqual(new Map([['acme/widgets', '# Widgets']]));
    expect(calls).toEqual([
      'https://api.github.com/repos/acme/widgets/readme',
      'https://api.github.com/repos/acme/missing/readme',
    ]);
  });

  it('batches large RAG ingest payloads', () => {
    const documents = [
      { content: 'a'.repeat(20), metadata: { repo_id: 1 } },
      { content: 'b'.repeat(20), metadata: { repo_id: 2 } },
      { content: 'c'.repeat(20), metadata: { repo_id: 3 } },
    ];

    expect(batchRagDocuments(documents, 95)).toEqual([
      [documents[0]],
      [documents[1]],
      [documents[2]],
    ]);
  });
});
