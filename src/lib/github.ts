export interface StarredRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  archived?: boolean;
  topics: string[];
  updated_at: string;
  created_at: string;
}

export interface FetchResult {
  repos: StarredRepo[];
  etag: string | null;
  notModified: boolean;
}

const MAX_GITHUB_ATTEMPTS = 3;

/** 429 (rate limit / abuse) + 5xx are transient and worth retrying. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() with exponential backoff. Retries on network errors and retryable
 * HTTP statuses (429 / 5xx); returns the response otherwise so the caller can
 * inspect 304 / non-retryable errors.
 */
async function fetchWithRetry(
  input: string,
  init: RequestInit,
  attempts = MAX_GITHUB_ATTEMPTS
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      // 500ms, 1000ms, 2000ms ... with light jitter.
      await delay(500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
    }
    try {
      const res = await fetch(input, init);
      if (res.ok || !isRetryableStatus(res.status) || attempt === attempts - 1) {
        return res;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('GitHub request failed after retries');
}

/**
 * Fetch all starred repos from GitHub API, with optional ETag for conditional requests.
 * If etag is provided and data hasn't changed, returns { notModified: true }.
 */
export async function fetchAllStarredRepos(
  accessToken: string,
  cachedEtag?: string | null
): Promise<FetchResult> {
  const repos: StarredRepo[] = [];
  let page = 1;
  const perPage = 100;
  let firstPageEtag: string | null = null;

  while (true) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'starboard',
    };

    // Only send If-None-Match on the first page to check if anything changed
    if (page === 1 && cachedEtag) {
      headers['If-None-Match'] = cachedEtag;
    }

    const response = await fetchWithRetry(
      `https://api.github.com/user/starred?per_page=${perPage}&page=${page}&sort=created&direction=desc`,
      { headers }
    );

    // 304 Not Modified — cache is still valid
    if (response.status === 304) {
      return { repos: [], etag: cachedEtag ?? null, notModified: true };
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    // Capture ETag from first page
    if (page === 1) {
      firstPageEtag = response.headers.get('etag');
    }

    const data: StarredRepo[] = await response.json();
    repos.push(...data);

    if (data.length < perPage) break;
    page++;
  }

  return { repos, etag: firstPageEtag, notModified: false };
}
