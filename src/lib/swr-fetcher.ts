/**
 * Shared SWR helpers. Prefer these over ad-hoc fetch wrappers so 429/5xx
 * from the Cloudflare edge can back off instead of hard-failing the UI.
 */

export class FetchHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, retryAfterMs: number | null = null) {
    super(String(status));
    this.name = 'FetchHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const asInt = Number.parseInt(header, 10);
  if (Number.isFinite(asInt) && asInt >= 0) {
    // Header is seconds
    return Math.min(asInt * 1000, 60_000);
  }
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.min(Math.max(asDate - Date.now(), 0), 60_000);
  }
  return null;
}

export async function jsonFetcher<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new FetchHttpError(
      response.status,
      parseRetryAfterMs(response.headers.get('Retry-After'))
    );
  }
  return response.json() as Promise<T>;
}

/** SWR onErrorRetry that respects Retry-After and skips auth/not-found. */
export function swrErrorRetry(
  error: unknown,
  _key: string,
  _config: unknown,
  revalidate: (opts?: { retryCount?: number }) => void,
  opts: { retryCount: number }
) {
  if (error instanceof Error && error.name === 'AbortError') return;

  const status =
    error instanceof FetchHttpError
      ? error.status
      : Number.parseInt(error instanceof Error ? error.message : '', 10);

  if (status === 401 || status === 403 || status === 404) return;

  const maxRetries = status === 429 ? 4 : 2;
  if (opts.retryCount >= maxRetries) return;

  const retryAfterMs =
    error instanceof FetchHttpError && error.retryAfterMs != null
      ? error.retryAfterMs
      : status === 429
        ? Math.min(2000 * 2 ** opts.retryCount, 20_000)
        : Math.min(1000 * 2 ** opts.retryCount, 8_000);

  setTimeout(() => {
    revalidate({ retryCount: opts.retryCount });
  }, retryAfterMs);
}
