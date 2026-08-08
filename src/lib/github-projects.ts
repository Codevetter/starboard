export interface GitHubProjectSlug {
  owner: string;
  repo: string;
  fullName: string;
}

export interface PublicGitHubProject {
  id: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  ownerAvatar: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  archived: boolean;
  topics: string[];
  createdAt: string;
  updatedAt: string;
}

const OWNER_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const REPO_PATTERN = /^[a-z\d_.-]{1,100}$/i;

export function parseGitHubProjectInput(input: string): GitHubProjectSlug | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    path = url.pathname;
  } else if (trimmed.includes('://')) {
    return null;
  }

  const segments = path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (segments.length !== 2) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) return null;

  return { owner, repo, fullName: `${owner}/${repo}` };
}

export async function fetchPublicGitHubProject(
  slug: GitHubProjectSlug,
  accessToken?: string
): Promise<PublicGitHubProject | null> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'starboard',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const repo = (await response.json()) as {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    visibility?: string;
    owner: { login: string; avatar_url: string };
    html_url: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    archived?: boolean;
    topics?: string[];
    created_at: string;
    updated_at: string;
  };

  if (repo.private || (repo.visibility && repo.visibility !== 'public')) return null;

  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    ownerLogin: repo.owner.login,
    ownerAvatar: repo.owner.avatar_url,
    htmlUrl: repo.html_url,
    description: repo.description,
    language: repo.language,
    stargazersCount: repo.stargazers_count,
    archived: Boolean(repo.archived),
    topics: repo.topics ?? [],
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
  };
}
