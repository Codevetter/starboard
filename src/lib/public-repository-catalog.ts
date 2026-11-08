import { cache } from 'react';
import { db } from '@/db';
import type { DbClient } from '@/db/client';
import snapshot from '@/data/public-repository-identities.json';
import { isPublishableRepository, publicRepositoryPath } from './public-repository-admission';
import { publicRepoFromRow, type RepoDetail } from './repo-detail';

export const REPOSITORY_PAGE_SIZE = 60;
export const REPOSITORY_SITEMAP_SIZE = 1000;
export const PUBLIC_REPOSITORY_COUNT = snapshot.repositories.length;
export const REPOSITORY_PAGE_COUNT = Math.ceil(PUBLIC_REPOSITORY_COUNT / REPOSITORY_PAGE_SIZE);
export const REPOSITORY_SITEMAP_COUNT = Math.ceil(
  PUBLIC_REPOSITORY_COUNT / REPOSITORY_SITEMAP_SIZE
);
export const PUBLIC_REPOSITORY_CAPTURED_AT = snapshot.capturedAt;
const admittedNames = new Map(
  snapshot.repositories.map(([id, fullName]) => [Number(id), String(fullName)])
);
export function hasPublishedRepositoryIdentity(id: number, fullName: string): boolean {
  return admittedNames.get(id) === fullName;
}

export function repositoryCatalogPath(page: number): string {
  return page === 1 ? '/explore' : `/explore?page=${page}`;
}

export function repositoryCatalogPage(raw: string | undefined): number | null {
  if (raw === undefined) return 1;
  if (!/^[1-9]\d{0,5}$/.test(raw)) return null;
  const page = Number(raw);
  return page <= REPOSITORY_PAGE_COUNT ? page : null;
}

// The immutable allowlist records identities already published by the guest
// API. Matching both ID and exact name prevents a renamed/reused record from
// silently acquiring that admission. There is no personal-library join.
export async function readPublicRepositorySlice(
  client: Pick<DbClient, 'execute'>,
  offset: number,
  limit: number
): Promise<RepoDetail[]> {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000
  ) {
    throw new Error('Invalid public repository slice');
  }
  const identities = snapshot.repositories.slice(offset, offset + limit);
  if (!identities.length) return [];
  const result = await client.execute({
    sql: `SELECT r.id, r.name, r.full_name, r.owner_login, r.owner_avatar,
                 r.html_url, r.description, r.language, r.stargazers_count,
                 r.archived, r.topics, r.repo_created_at, r.repo_updated_at
          FROM json_each(?) admitted
          JOIN repos r ON r.id = json_extract(admitted.value, '$[0]')
            AND r.full_name = json_extract(admitted.value, '$[1]') COLLATE BINARY
          WHERE r.stargazers_count >= 5000 AND length(trim(r.description)) >= 30
          ORDER BY CAST(admitted.key AS INTEGER)`,
    args: [JSON.stringify(identities)],
  });
  return result.rows.filter(isPublishableRepository).map(publicRepoFromRow);
}

// Cache only these public, bounded slices for five minutes per Worker isolate.
// The size cap prevents arbitrary pagination requests from growing memory.
const slices = new Map<string, { expires: number; value: Promise<RepoDetail[]> }>();
export const getPublicRepositorySlice = cache((offset: number, limit: number) => {
  const key = `${offset}:${limit}`;
  const previous = slices.get(key);
  if (previous && previous.expires > Date.now()) return previous.value;
  if (slices.size >= 32) slices.delete(slices.keys().next().value!);
  const value = readPublicRepositorySlice(db, offset, limit).catch((error) => {
    slices.delete(key);
    throw error;
  });
  slices.set(key, { expires: Date.now() + 300_000, value });
  return value;
});

export { publicRepositoryPath };
