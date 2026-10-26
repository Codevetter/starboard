import { extractNeeds, createNeedDrivenIntelligence } from '@/lib/need-driven-intelligence';
import { describe, expect, it, vi } from 'vitest';

import {
  createProjectContextLoader,
  projectReadmeContext,
  catalogReadmeContext,
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

  it('retains named collection and editor sections with their headings', () => {
    const text = projectReadmeContext(
      '# Workbench\nBrowse public records.\n## Nomad Atlas\nFilter places by cost.\n## Research Papers coverage\nSearch papers and citations.\n## Saved views and compare tray\nSave exact filters and compare record snapshots.\n## Caption creation release candidate\nEdit text and export PNG.\n## Anna edition\nHost-only upload flow.'
    );
    expect(text).toContain('## Research Papers coverage');
    expect(text).toContain('Save exact filters');
    expect(text).toContain('Edit text and export PNG');
    expect(text).toContain('## Anna edition');
  });

  it('reserves space for later features instead of truncating the opening section', () => {
    const text = projectReadmeContext(
      `# Investigator\n## Daily use\n${'Inspect processes and metadata.\n'.repeat(1000)}\n## Recordings\nRecord a bounded diagnostic window.\n## Baselines\nCompare later recordings against one saved capture.`
    );
    expect(text.length).toBeLessThanOrEqual(12_000);
    expect(text).toContain('Record a bounded diagnostic window');
    expect(text).toContain('Compare later recordings');
    expect(text).toContain('## Baselines');
  });

  it('limits dated status history while retaining the latest implementation evidence', () => {
    const text = projectReadmeContext(
      '# Status\n## 2026-10-12 — current\nCurrent source behavior.\n## 2026-10-11 — previous\nPrevious evidence.\n## 2026-10-10 — update\nUpdate evidence.\n## 2026-01-01 — historical\nSuperseded goals and receipts.'
    );
    expect(text).toContain('Current source behavior');
    expect(text).not.toContain('Superseded goals');
  });
  it('samples distinct implementation workflows and excludes tests, operations and other folders', async () => {
    const paths = [
      'apps/tool/README.md',
      'apps/tool/src/search.ts',
      'apps/tool/src/search-controller.ts',
      'apps/tool/src/search-results.ts',
      'apps/tool/src/search-cache.ts',
      'apps/tool/src/studio.ts',
      'apps/tool/src/export.ts',
      'apps/tool/src/feedback.ts',
      'apps/tool/src/import.ts',
      'apps/tool/src/search.test.ts',
      'apps/tool/src/search_test.go',
      'apps/tool/src/__tests__/studio.ts',
      'apps/tool/scripts/search.ts',
      'apps/tool/designs/studio.ts',
      'apps/tool/src/search.d.ts',
      'apps/tool/src/search.config.ts',
      'apps/other/src/studio.ts',
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = String(url);
      if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
      if (address.includes('/git/trees/'))
        return Response.json({
          sha: revision,
          tree: paths.map((path) => ({ path, type: 'blob', size: 100 })),
        });
      if (address.endsWith('/README.md'))
        return new Response(
          '# Tool\nSearch, studio, export, feedback and import.\nThe search implementation is src/search.ts, src/search-controller.ts, src/search-results.ts and src/search-cache.ts.'
        );
      return new Response('export function feature() { return true; }');
    });
    const enriched = await createProjectContextLoader(fetcher)(project, 'test-token', {
      scope: 'apps/tool',
    });
    expect(enriched.sourceContext?.files).toEqual(
      expect.arrayContaining([
        'apps/tool/README.md',
        'apps/tool/src/export.ts',
        'apps/tool/src/feedback.ts',
        'apps/tool/src/import.ts',
        'apps/tool/src/search.ts',
        'apps/tool/src/studio.ts',
      ])
    );
    expect(enriched.sourceContext?.files).toHaveLength(9);
    expect(
      enriched.sourceContext?.files?.some((path) =>
        /test|spec|scripts|designs|config|\.d\./.test(path)
      )
    ).toBe(false);
    const raw = fetcher.mock.calls.filter(([url]) => String(url).startsWith('https://raw.'));
    expect(raw).toHaveLength(9);
    for (const [url, options] of raw) {
      expect(String(url)).toContain(`/${revision}/apps/tool/`);
      expect(options?.headers).toBeUndefined();
    }
  });

  it('marks sampled implementation text as partial when a large file is shortened', async () => {
    const content = `export function editor() {\n${'const text = "caption";\n'.repeat(1000)}\nreturn "export PNG";\n}`;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = String(url);
      if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
      if (address.includes('/git/trees/'))
        return Response.json({
          sha: revision,
          tree: [
            { path: 'README.md', type: 'blob', size: 100 },
            { path: 'src/editor.ts', type: 'blob', size: content.length },
          ],
        });
      return new Response(
        address.endsWith('/README.md') ? '# Tool\nAn editor for captions.' : content
      );
    });
    const enriched = await createProjectContextLoader(fetcher)(project);
    expect(enriched.sourceContext?.status).toBe('partial');
    const document = enriched.sourceContext?.documents?.find(
      (item) => item.path === 'src/editor.ts'
    );
    expect(document?.truncated).toBe(true);
    expect(document?.text).toContain('export function editor');
    expect(document?.text).toContain('export PNG');
    expect(document?.text.length).toBe(16_002);
  });
  it('prefers declared runtime entry points and omits supplementary language exercises', async () => {
    const paths = [
      'README.md',
      'package.json',
      'src/main.ts',
      'src/projector.ts',
      'basic/projector.ts',
      'advent/projector.ts',
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const address = String(url);
      if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
      if (address.includes('/git/trees/'))
        return Response.json({
          sha: revision,
          tree: paths.map((path) => ({ path, type: 'blob', size: 100 })),
        });
      if (address.endsWith('/README.md'))
        return new Response(
          '# Tool\nProjector is a hierarchical directory key-value store.\n- `basic/` and `advent/` - additional language exercises'
        );
      return new Response(
        address.endsWith('/package.json')
          ? '{"main":"./src/main.ts"}'
          : 'export function projector() {}'
      );
    });
    expect((await createProjectContextLoader(fetcher)(project)).sourceContext?.files).toEqual([
      'package.json',
      'README.md',
      'src/main.ts',
      'src/projector.ts',
    ]);
  });
});

describe('catalog API source examples', () => {
  it('retains literal usage syntax while product prose keeps install commands out', () => {
    const source =
      '# JSON store\nReads and writes JSON.\n\n## Installation\n```sh\nnpm install lowdb\n```\n\n## Usage\n```ts\nconst db = await JSONFilePreset<Record<string, string>>(file, {});\nawait db.read();\nawait db.write();\n```';
    expect(catalogReadmeContext(source)).toContain('JSONFilePreset<Record<string, string>>');
    expect(catalogReadmeContext(source)).toContain('await db.read();');
    expect(catalogReadmeContext(source)).not.toContain('npm install');
    expect(projectReadmeContext(source)).not.toContain('await db.read();');
  });
  it('reserves prose coverage across late sections within the source budget', () => {
    const source =
      '# Tool\n' +
      'Early prose. '.repeat(1500) +
      '\n## Late workflow\nExports records.\n```ts\nexportRecords(rows);\n```';
    const context = catalogReadmeContext(source);
    expect(context.length).toBeLessThanOrEqual(12000);
    expect(context).toContain('Exports records.');
    expect(context).toContain('exportRecords(rows);');
  });
});

it('preserves Requirements evidence through GitHub source loading without accepting cut-off tasks', async () => {
  const content =
    '# Product\nA payment app.\n## Requirements\n- [ ] Add offline payment reconciliation.\n## Examples\n- [ ] Add imaginary feature.\n## Development\n' +
    'x'.repeat(11830) +
    '\n- [ ] Add a partially captured requirement ' +
    'x'.repeat(200);
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const address = String(url);
    if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
    if (address.includes('/git/trees/'))
      return Response.json({
        sha: revision,
        tree: [{ path: 'PRODUCT.md', type: 'blob', size: content.length }],
      });
    return new Response(content);
  });
  const enriched = await createProjectContextLoader(fetcher)(project);
  expect(extractNeeds(enriched).map((need) => need.title)).toEqual([
    'Add offline payment reconciliation.',
  ]);
  const report = await createNeedDrivenIntelligence({
    database: {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      batch: vi.fn().mockResolvedValue([]),
    },
    vectorStore: () => ({ query: async () => [], queryByRepoId: async () => [] }),
    embed: async () => [],
  })(enriched);
  expect(report.needs[0].need.title).toBe('Add offline payment reconciliation.');
  expect(report.status).toBe('degraded');
});

it('keeps requirement-only product files available to extraction', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const address = String(url);
    if (address.endsWith('/repos/acme/contacts')) return Response.json(metadata);
    if (address.includes('/git/trees/'))
      return Response.json({
        sha: revision,
        tree: [{ path: 'PRODUCT.md', type: 'blob', size: 100 }],
      });
    return new Response('## Requirements\n- [ ] Add offline payment reconciliation.');
  });
  const enriched = await createProjectContextLoader(fetcher)(project);
  expect(extractNeeds(enriched).map((need) => need.title)).toEqual([
    'Add offline payment reconciliation.',
  ]);
});
