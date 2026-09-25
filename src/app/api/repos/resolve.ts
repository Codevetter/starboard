import { db } from '@/db';

export interface GitHubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  archived?: boolean;
  topics?: string[];
  created_at: string;
  updated_at: string;
}

const REPO_UPSERT_SQL = `INSERT INTO repos (id, name, full_name, owner_login, owner_avatar, html_url,
            description, language, stargazers_count, archived, topics, repo_created_at, repo_updated_at, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, full_name = excluded.full_name,
            owner_login = excluded.owner_login, owner_avatar = excluded.owner_avatar,
            html_url = excluded.html_url, description = excluded.description,
            language = excluded.language, stargazers_count = excluded.stargazers_count,
            archived = excluded.archived, topics = excluded.topics, repo_created_at = excluded.repo_created_at,
            repo_updated_at = excluded.repo_updated_at, fetched_at = excluded.fetched_at`;

/**
 * Upsert a GitHub repo row into D1. Shared by resolveRepoId and the
 * [repoId] GET route so the INSERT/ON CONFLICT shape stays in one place.
 */
export async function upsertRepoFromGitHub(gh: GitHubRepoResponse): Promise<void> {
  await db.execute({
    sql: REPO_UPSERT_SQL,
    args: [
      gh.id,
      gh.name,
      gh.full_name,
      gh.owner.login,
      gh.owner.avatar_url,
      gh.html_url,
      gh.description ?? null,
      gh.language ?? null,
      gh.stargazers_count,
      gh.archived ? 1 : 0,
      JSON.stringify(gh.topics ?? []),
      gh.created_at,
      gh.updated_at,
    ],
  });
}

/** How old a repos row may get before a detail read refreshes it from GitHub. */
export const REPO_METADATA_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * True when the row's metadata was fetched more than the TTL ago — or when
 * fetched_at is missing/NULL (rows written before freshness tracking), which
 * is treated as stale so they self-heal on the next read.
 */
export function repoMetadataIsStale(fetchedAt: unknown): boolean {
  if (typeof fetchedAt !== 'string' || fetchedAt.length === 0) return true;
  // datetime('now') stores 'YYYY-MM-DD HH:MM:SS' in UTC; make that explicit.
  const parsed = Date.parse(`${fetchedAt.replace(' ', 'T')}Z`);
  return !Number.isFinite(parsed) || Date.now() - parsed > REPO_METADATA_TTL_MS;
}

/**
 * Re-fetch a repo's GitHub metadata and upsert it, recording a star snapshot
 * so growth charts see the movement. Returns true when the row was refreshed.
 * fetched_at is stamped on any completed GitHub response — including errors —
 * so failures retry on the next TTL window instead of on every read.
 */
export async function refreshRepoFromGitHub(
  fullName: string,
  accessToken?: string | null
): Promise<boolean> {
  const ghRes = await fetch(`https://api.github.com/repos/${fullName}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'starboard',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (!ghRes.ok) {
    // Stamp fetched_at on any completed response so a transient GitHub error
    // or a deleted/renamed repo does not trigger a request on every read.
    await db.execute({
      sql: `UPDATE repos SET fetched_at = datetime('now')
            WHERE full_name = ? COLLATE NOCASE`,
      args: [fullName],
    });
    return false;
  }

  const gh = (await ghRes.json()) as GitHubRepoResponse;
  await upsertRepoFromGitHub(gh);
  await db.execute({
    sql: `INSERT INTO repo_star_snapshots (repo_id, stargazers_count)
          VALUES (?, ?)
          ON CONFLICT(repo_id, captured_at) DO UPDATE SET
            stargazers_count = excluded.stargazers_count`,
    args: [gh.id, gh.stargazers_count],
  });
  return true;
}

/**
 * Resolve owner/repo slug to a numeric repo ID.
 * If the repo isn't in our DB yet, fetches from GitHub and inserts it.
 * Returns the numeric repo ID or null if not found on GitHub.
 */
export async function resolveRepoId(owner: string, repo: string): Promise<number | null> {
  const fullName = `${owner}/${repo}`;

  // Check DB first
  const existing = await db.execute({
    sql: 'SELECT id FROM repos WHERE full_name = ? COLLATE NOCASE',
    args: [fullName],
  });

  if (existing.rows.length > 0) {
    return existing.rows[0].id as number;
  }

  // Fetch from GitHub
  const ghRes = await fetch(`https://api.github.com/repos/${fullName}`, {
    next: { revalidate: 3600 },
  });

  if (!ghRes.ok) return null;

  const gh = (await ghRes.json()) as GitHubRepoResponse;

  await upsertRepoFromGitHub(gh);

  return gh.id as number;
}
