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

interface GitHubRepositoryResponse {
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
}

export class GitHubProjectApiError extends Error {
  constructor(public readonly status: number) {
    super(`GitHub API error: ${status}`);
    this.name = 'GitHubProjectApiError';
  }
}

class GitHubProjectPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubProjectPaginationError';
  }
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
      ...(accessToken ? { cache: 'no-store' as const } : { next: { revalidate: 1800 } }),
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GitHubProjectApiError(response.status);
  }

  const repo = (await response.json()) as GitHubRepositoryResponse;

  if (repo.private || (repo.visibility && repo.visibility !== 'public')) return null;

  return mapPublicProject(repo);
}

function mapPublicProject(repo: GitHubRepositoryResponse): PublicGitHubProject {
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

export async function fetchPublicGitHubRepositories(
  accessToken: string
): Promise<PublicGitHubProject[]> {
  const initialUrl = new URL('https://api.github.com/user/repos');
  initialUrl.search = new URLSearchParams({
    affiliation: 'owner,collaborator,organization_member',
    visibility: 'public',
    sort: 'pushed',
    direction: 'desc',
    per_page: '100',
  }).toString();
  const seenUrls = new Set<string>();
  const repositories: GitHubRepositoryResponse[] = [];
  let nextUrl: string | null = initialUrl.toString();

  while (nextUrl) {
    if (seenUrls.has(nextUrl)) {
      throw new GitHubProjectPaginationError('GitHub repository pagination repeated a page');
    }
    seenUrls.add(nextUrl);

    const response = await fetch(nextUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'starboard',
      },
    });

    if (!response.ok) throw new GitHubProjectApiError(response.status);
    repositories.push(...((await response.json()) as GitHubRepositoryResponse[]));
    nextUrl = nextGitHubPage(response.headers.get('link'));
  }

  return repositories
    .filter((repo) => !repo.private && (!repo.visibility || repo.visibility === 'public'))
    .map(mapPublicProject);
}

function nextGitHubPage(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  for (const entry of linkHeader.split(',')) {
    const match = entry.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (!match?.[1] || !match[2]?.split(/\s+/).includes('next')) continue;

    let url: URL;
    try {
      url = new URL(match[1]);
    } catch {
      throw new GitHubProjectPaginationError('GitHub returned an invalid pagination URL');
    }
    if (url.origin !== 'https://api.github.com') {
      throw new GitHubProjectPaginationError('GitHub returned an unexpected pagination origin');
    }
    return url.toString();
  }

  return null;
}
