import { DatabaseSync } from 'node:sqlite';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from '@/db/client';
import snapshot from '@/data/public-repository-identities.json';
import { isPublishableRepository } from '@/lib/public-repository-admission';
import { publicRepositoryPath } from '@/lib/public-repository-admission';
import {
  readPublicRepositorySlice,
  repositoryCatalogPage,
  REPOSITORY_PAGE_COUNT,
} from '@/lib/public-repository-catalog';
import { repositorySitemapXml } from '@/lib/repository-sitemap';
import RepositoryCatalog, { generateMetadata } from '@/app/explore/page';

const execute = vi.hoisted(() => vi.fn());
vi.mock('@/db', () => ({ db: { execute } }));

vi.mock('@/components/top-bar', () => ({ TopBar: () => null }));
const [id, fullName] = snapshot.repositories[0];
const [owner, name] = String(fullName).split('/');
const repo = {
  id,
  full_name: fullName,
  owner_login: owner,
  name,
  owner_avatar: '',
  html_url: `https://github.com/${fullName}`,
  description: 'A useful source-backed public repository description.',
  language: 'Java',
  stargazers_count: 6000,
  topics: '["game"]',
  archived: 0,
  repo_created_at: null,
  repo_updated_at: '2026-10-01T00:00:00Z',
};

describe('public repository publication boundary', () => {
  it('retains one valid canonical identity per admitted source record', () => {
    const ids = new Set();
    const paths = new Set();
    for (const [repoId, sourceName] of snapshot.repositories) {
      expect(Number.isSafeInteger(repoId)).toBe(true);
      const path = publicRepositoryPath(String(sourceName));
      expect(path).not.toBeNull();
      ids.add(repoId);
      paths.add(path);
    }
    expect(ids.size).toBe(snapshot.repositories.length);
    expect(paths.size).toBe(snapshot.repositories.length);
  });
  it('renders admitted repository links and ordinary next-page links in initial HTML', async () => {
    execute.mockResolvedValue({ rows: [repo] });
    const html = renderToStaticMarkup(
      await RepositoryCatalog({ searchParams: Promise.resolve({}) })
    );
    expect(html).toContain(`href="/explore/${fullName}"`);
    expect(html).toContain('A useful source-backed public repository description.');
    expect(html).toContain('href="/explore?page=2"');
    expect(html).not.toContain('private owner note');
    expect(
      (await generateMetadata({ searchParams: Promise.resolve({ page: '2' }) })).alternates
        ?.canonical
    ).toBe('/explore?page=2');
    await expect(
      RepositoryCatalog({ searchParams: Promise.resolve({ page: '999999' }) })
    ).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  });
  it.each([
    { private: true },
    { visibility: 'private' },
    { stargazers_count: 4999 },
    { html_url: 'https://example.com/other' },
    { full_name: '../private' },
    { owner_login: 'other' },
    { description: 'short' },
    { id: -1 },
  ])('rejects unsupported or unqualified input %j', (override) => {
    expect(isPublishableRepository({ ...repo, ...override })).toBe(false);
  });

  it('executes the actual identity admission SQL and emits only public facts in matching HTML/XML links', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const columns = Object.keys(repo);
    sqlite.exec(
      `CREATE TABLE repos (${columns.map((key) => `${key} ${key === 'id' ? 'INTEGER PRIMARY KEY' : ''}`).join(',')}, notes TEXT)`
    );
    const insert = sqlite.prepare(
      `INSERT INTO repos (${columns.join(',')},notes) VALUES (${columns.map(() => '?').join(',')},?)`
    );
    insert.run(...Object.values(repo), 'private owner note');
    insert.run(
      ...Object.values({
        ...repo,
        id: 2,
        full_name: 'private/project',
        owner_login: 'private',
        name: 'project',
      }),
      'private library membership'
    );
    const client: Pick<DbClient, 'execute'> = {
      async execute(statement) {
        if (typeof statement === 'string') throw new Error('Expected a bound query');
        const rows = sqlite.prepare(statement.sql).all(...(statement.args as [string]));
        return { rows, columns: [], rowsAffected: 0, lastInsertRowid: null };
      },
    };
    const rows = await readPublicRepositorySlice(client, 0, 60);
    expect(rows.map((row) => row.full_name)).toEqual([fullName]);
    expect(JSON.stringify(rows)).not.toContain('private owner note');
    expect(JSON.stringify(rows)).not.toContain('private/project');
    const xml = repositorySitemapXml(rows);
    expect(xml).toContain(`<loc>https://starboard.codevetter.com/explore/${fullName}</loc>`);
    expect(xml).toContain('<lastmod>2026-10-01T00:00:00.000Z</lastmod>');
    sqlite.prepare('UPDATE repos SET full_name = ? WHERE id = ?').run('renamed/project', id);
    expect(await readPublicRepositorySlice(client, 0, 60)).toEqual([]);
    sqlite.close();
  });

  it('rejects invalid/out-of-range pagination and keeps the last page reachable', () => {
    expect(repositoryCatalogPage(undefined)).toBe(1);
    expect(repositoryCatalogPage(String(REPOSITORY_PAGE_COUNT))).toBe(REPOSITORY_PAGE_COUNT);
    for (const raw of ['0', '-1', '01', '2oops', String(REPOSITORY_PAGE_COUNT + 1)])
      expect(repositoryCatalogPage(raw)).toBeNull();
  });

  it('does not fabricate modification dates', () => {
    const xml = repositorySitemapXml([
      {
        ...repo,
        id: Number(id),
        full_name: String(fullName),
        archived: false,
        topics: [],
        repo_updated_at: null,
      },
    ]);
    expect(xml).not.toContain('lastmod');
  });
});
