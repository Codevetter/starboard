import { describe, expect, it, vi } from 'vitest';

import {
  createProjectContextLoader,
  projectReadmeContext,
  parseProjectFolder,
} from '@/lib/project-context';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

const project: ProjectRecommendationRepo = {
  id: 1,
  name: 'contacts',
  fullName: 'acme/contacts',
  htmlUrl: 'https://github.com/acme/contacts',
  description: 'Native contacts app',
  language: 'Swift',
  stargazersCount: 1,
  archived: false,
  topics: [],
  tools: [],
};
const revision = 'a'.repeat(40);
const metadata = { private: false, visibility: 'public', default_branch: 'main' };

describe('public project source context', () => {
  it('uses a subapp README and manifests without inheriting root purpose or tools', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = String(url);
      if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
      if (address.includes('/git/trees/'))
        return Response.json({
          sha: revision,
          tree: [
            { path: 'README.md', type: 'blob', size: 100 },
            { path: 'package.json', type: 'blob', size: 100 },
            { path: 'apps/memory-map/README.md', type: 'blob', size: 100 },
            { path: 'apps/memory-map/package.json', type: 'blob', size: 100 },
          ],
        });
      return address.endsWith('/README.md')
        ? new Response('# Memory Map\nBrowser-local ChatGPT export analysis and theme discovery.')
        : new Response('{"dependencies":{"astro":"7"}}');
    });
    const result = await createProjectContextLoader(fetcher)(
      {
        ...project,
        description: 'Root product directory',
        aiSummary: 'The root platform',
        aiKeywords: ['directory'],
        tools: [{ key: 'next', name: 'Next.js', category: 'framework', confidence: 95 }],
      },
      undefined,
      { input: 'https://github.com/acme/contacts/tree/main/apps/memory-map' }
    );
    expect(result.description).toContain('ChatGPT export');
    expect(result.topics).toEqual([]);
    expect(result.aiSummary).toBeNull();
    expect(result.aiKeywords).toEqual([]);
    expect(result.language).toBeNull();
    expect(result.tools.map((tool) => tool.key)).toEqual(['astro']);
    expect(result.sourceContext).toMatchObject({
      scope: 'apps/memory-map',
      files: ['apps/memory-map/package.json', 'apps/memory-map/README.md'],
    });
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).startsWith('https://raw.'))
    ).toHaveLength(2);
  });
  it.each([
    '../private',
    'apps/../../private',
    '/absolute/path',
    'apps//nested',
    'apps/folder?secret',
  ])('rejects unsafe folder paths: %s', (path) => {
    expect(parseProjectFolder(path)).toBeNull();
  });
  it('uses pinned public files, detects existing tools and leaves OAuth off raw requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = String(url);
      if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
      if (address.includes('/git/trees/'))
        return Response.json({
          sha: revision,
          tree: [
            { path: 'README.md', type: 'blob', size: 100 },
            { path: 'package.json', type: 'blob', size: 100 },
            { path: 'apps/web/package.json', type: 'blob', size: 100 },
            { path: 'examples/package.json', type: 'blob', size: 100 },
            { path: '.env', type: 'blob', size: 100 },
            { path: 'AGENTS.md', type: 'blob', size: 100 },
          ],
        });
      if (address.endsWith('/README.md'))
        return new Response(
          '# Contacts\nKeep relationships alive.\n## Install\nnpm install next\n## Features\nContact reminders.'
        );
      return new Response('{"dependencies":{"react":"19","vitest":"4"}}');
    });
    const enriched = await createProjectContextLoader(fetcher)(project, 'test-token');
    expect(enriched.sourceContext).toMatchObject({
      status: 'complete',
      revision,
      files: ['apps/web/package.json', 'package.json', 'README.md'],
    });
    expect(enriched.sourceContext?.readme).toContain('Contact reminders');
    expect(enriched.sourceContext?.readme).not.toContain('npm install');
    expect(enriched.sourceContext?.dependencies).toEqual(['react', 'vitest']);
    expect(enriched.tools.map((tool) => tool.key)).toEqual(
      expect.arrayContaining(['react', 'vitest'])
    );
    const rawCalls = fetcher.mock.calls.filter(([url]) =>
      String(url).startsWith('https://raw.githubusercontent.com/')
    );
    expect(rawCalls).toHaveLength(3);
    for (const [url, options] of rawCalls) {
      expect(String(url)).toContain(`/${revision}/`);
      expect(options?.headers).toBeUndefined();
    }
  });

  it('does not read a private repository even with an authenticated session', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...metadata, private: true, visibility: 'private' }));
    const enriched = await createProjectContextLoader(fetcher)(project, 'test-token');
    expect(enriched.sourceContext?.status).toBe('unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(enriched.tools).toEqual([]);
  });

  it('bounds manifest requests and reports incomplete coverage', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = String(url);
      if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
      if (address.includes('/git/trees/'))
        return Response.json({
          sha: revision,
          tree: Array.from({ length: 20 }, (_, index) => ({
            path: `apps/${index}/package.json`,
            type: 'blob',
            size: 20,
          })),
        });
      return new Response('{}');
    });
    const enriched = await createProjectContextLoader(fetcher)(project);
    expect(enriched.sourceContext?.status).toBe('partial');
    expect(enriched.sourceContext?.files).toHaveLength(10);
    expect(fetcher).toHaveBeenCalledTimes(12);
  });

  it('keeps successful files when another public source fetch fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = String(url);
      if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
      if (address.includes('/git/trees/'))
        return Response.json({
          sha: revision,
          tree: [
            { path: 'README.md', type: 'blob', size: 100 },
            { path: 'package.json', type: 'blob', size: 100 },
          ],
        });
      return address.endsWith('/README.md')
        ? new Response('Relationship reminders')
        : new Response('', { status: 404 });
    });
    const enriched = await createProjectContextLoader(fetcher)(project);
    expect(enriched.sourceContext).toMatchObject({ status: 'partial', files: ['README.md'] });
  });

  it('degrades safely on GitHub errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'));
    expect((await createProjectContextLoader(fetcher)(project)).sourceContext?.status).toBe(
      'unavailable'
    );
  });

  it('does not substitute the root purpose when a folder inspection fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    const enriched = await createProjectContextLoader(fetcher)(project, undefined, {
      scope: 'apps/memory-map',
    });
    expect(enriched.description).toBeNull();
    expect(enriched.topics).toEqual([]);
    expect(enriched.tools).toEqual([]);
    expect(enriched.sourceContext?.status).toBe('unavailable');
  });

  it('strips installation noise without dropping later product sections', () => {
    expect(
      projectReadmeContext(
        '# Kith\nKeep in touch.\n## Setup\n```sh\nnpm install\n```\n## Features\n[Reminders](https://example.com) and relationship history.'
      )
    ).toContain('Reminders and relationship history.');
  });
});
