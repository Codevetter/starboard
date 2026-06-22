import { buildRepoEmbeddingText } from '@/lib/embeddings';

interface StarboardRagRepo {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count?: number;
  topics: string[];
}

interface RagDocument {
  content: string;
  metadata: Record<string, unknown>;
}

interface ReadmeFetchOptions {
  fetchImpl?: typeof fetch;
  concurrency?: number;
  onError?: (repo: StarboardRagRepo, error: unknown) => void;
}

const DEFAULT_README_CONCURRENCY = 4;

function repoApiPath(fullName: string): string {
  return fullName.split('/').map(encodeURIComponent).join('/');
}

export async function fetchRepoReadmeText(
  accessToken: string,
  repo: StarboardRagRepo,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${repoApiPath(repo.full_name)}/readme`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'starboard',
      },
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub README fetch failed ${res.status}`);
  const text = (await res.text()).trim();
  return text || null;
}

export async function fetchRepoReadmes(
  accessToken: string,
  repos: StarboardRagRepo[],
  options: ReadmeFetchOptions = {}
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const fetchImpl = options.fetchImpl ?? fetch;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_README_CONCURRENCY);
  let cursor = 0;

  async function worker() {
    while (cursor < repos.length) {
      const repo = repos[cursor++];
      if (!repo) continue;
      try {
        const readme = await fetchRepoReadmeText(accessToken, repo, fetchImpl);
        if (readme) out.set(repo.full_name, readme);
      } catch (error) {
        options.onError?.(repo, error);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, repos.length) }, () => worker()));
  return out;
}

export function buildStarboardRagDocument(
  userId: string,
  repo: StarboardRagRepo,
  readmeText?: string | null
): RagDocument {
  const base = buildRepoEmbeddingText(repo);
  const readme = readmeText?.trim();
  const content = [
    `Repository: ${repo.full_name}`,
    `Summary: ${base}`,
    typeof repo.stargazers_count === 'number' ? `Stars: ${repo.stargazers_count}` : null,
    readme ? `README:\n${readme}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    content,
    metadata: {
      user_id: userId,
      repo_id: repo.id,
      full_name: repo.full_name,
      language: repo.language,
      has_readme: Boolean(readme),
      source: readme ? 'github_readme' : 'github_repo_metadata',
    },
  };
}
