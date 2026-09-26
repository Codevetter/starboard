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
            description, language, stargazers_count, archived, topics, repo_created_at, repo_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, full_name = excluded.full_name,
            owner_login = excluded.owner_login, owner_avatar = excluded.owner_avatar,
            html_url = excluded.html_url, description = excluded.description,
            language = excluded.language, stargazers_count = excluded.stargazers_count,
            archived = excluded.archived, topics = excluded.topics, repo_created_at = excluded.repo_created_at,
            repo_updated_at = excluded.repo_updated_at`;

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

export interface CatalogRepo {
  id: number;
  name: string;
  full_name: string;
  owner_login: string;
  owner_avatar: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  archived: boolean;
  topics: string[];
  repo_created_at: string | null;
  repo_updated_at: string | null;
}

function rowToCatalogRepo(row: Record<string, unknown>): CatalogRepo {
  let topics: string[] = [];
  try {
    const parsed = JSON.parse(String(row.topics ?? '[]'));
    if (Array.isArray(parsed)) topics = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    // malformed topics JSON renders as an empty list
  }
  return {
    id: Number(row.id),
    name: String(row.name),
    full_name: String(row.full_name),
    owner_login: String(row.owner_login),
    owner_avatar: String(row.owner_avatar),
    html_url: String(row.html_url),
    description: row.description == null ? null : String(row.description),
    language: row.language == null ? null : String(row.language),
    stargazers_count: Number(row.stargazers_count ?? 0),
    archived: Number(row.archived ?? 0) === 1,
    topics,
    repo_created_at: row.repo_created_at == null ? null : String(row.repo_created_at),
    repo_updated_at: row.repo_updated_at == null ? null : String(row.repo_updated_at),
  };
}

/**
 * Read a repo from the catalog by owner/name. D1 only — no GitHub fetch.
 * Used by server-rendered pages that must not block on upstream API calls.
 */
export async function getRepoFromDb(fullName: string): Promise<CatalogRepo | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM repos WHERE full_name = ? COLLATE NOCASE',
    args: [fullName],
  });
  if (result.rows.length === 0) return null;
  return rowToCatalogRepo(result.rows[0]);
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
