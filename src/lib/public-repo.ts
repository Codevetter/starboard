import { cache } from 'react';

import { db } from '@/db';
import type { GitHubRepoResponse } from '@/app/api/repos/resolve';
import type { RepoDetail } from '@/lib/repo-detail';

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
// and never populates the catalog as a side effect of a crawler visit.
export const getPublicRepo = cache(async (fullName: string): Promise<RepoDetail | null> => {
  const result = await db.execute({
    sql: `SELECT id, name, full_name, owner_login, owner_avatar, html_url,
                 description, language, stargazers_count, archived, topics,
                 repo_created_at, repo_updated_at
          FROM repos WHERE full_name = ? COLLATE NOCASE`,
    args: [fullName],
  });
  const row = result.rows[0];
  if (row) {
    return {
      id: row.id as number,
      name: row.name as string,
      full_name: row.full_name as string,
      owner_login: row.owner_login as string,
      owner_avatar: row.owner_avatar as string,
      html_url: row.html_url as string,
      description: row.description as string | null,
      language: row.language as string | null,
      stargazers_count: row.stargazers_count as number,
      archived: Boolean(row.archived),
      topics: JSON.parse((row.topics as string) || '[]'),
      repo_created_at: row.repo_created_at as string | null,
      repo_updated_at: row.repo_updated_at as string | null,
    };
  }

  const response = await fetch(`https://api.github.com/repos/${fullName}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'starboard' },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Public repository lookup failed: ${response.status}`);
  const repo = (await response.json()) as GitHubRepoResponse;
  return {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    owner_login: repo.owner.login,
    owner_avatar: repo.owner.avatar_url,
    html_url: repo.html_url,
    description: repo.description,
    language: repo.language,
    stargazers_count: repo.stargazers_count,
    archived: Boolean(repo.archived),
    topics: repo.topics ?? [],
    repo_created_at: repo.created_at,
    repo_updated_at: repo.updated_at,
  };
});
