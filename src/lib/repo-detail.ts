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
