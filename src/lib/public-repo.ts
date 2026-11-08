import { cache } from 'react';

import { db } from '@/db';
import { type RepoDetail, publicRepoFromRow } from '@/lib/repo-detail';

export function repositorySlug(parts: string[]): string | null {
  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(parts[0]) ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(parts[1]) ||
    parts[1] === '.' ||
    parts[1] === '..'
  )
    return null;
  return parts.join('/');
}

// Request-local deduplication shares the public record between metadata,
// layout and page. This read never loads a session, user notes or saved lists,
// and never contacts GitHub or populates the catalog on a crawler visit.
// Explicit project preview/connection owns uncataloged upstream lookups.
export const getPublicRepo = cache(async (fullName: string): Promise<RepoDetail | null> => {
  const result = await db.execute({
    sql: `SELECT id, name, full_name, owner_login, owner_avatar, html_url,
                 description, language, stargazers_count, archived, topics,
                 repo_created_at, repo_updated_at
          FROM repos WHERE full_name = ? COLLATE NOCASE`,
    args: [fullName],
  });
  const row = result.rows[0];
  return row ? publicRepoFromRow(row) : null;
});
