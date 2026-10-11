export interface RepoDetail {
  id: number;
  name: string;
  full_name: string;
  owner_login: string;
  owner_avatar: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  archived?: boolean;
  topics: string[];
  repo_created_at: string | null;
  repo_updated_at: string | null;
}

export interface RepoDetailResponse {
  repo: RepoDetail;
}

export function publicRepoFromRow(row: Record<string, unknown>): RepoDetail {
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
