'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import { replaceAbortableJsonRequest } from '@/lib/abortable-fetch';

export type SortOption =
  | 'relevance'
  | 'recently-starred'
  | 'most-stars'
  | 'fastest-growing'
  | 'recently-updated'
  | 'name-az';

// Map frontend sort names to API sort params
const sortMap: Record<SortOption, string> = {
  relevance: 'relevance',
  'recently-starred': 'starred',
  'most-stars': 'stars',
  'fastest-growing': 'growth',
  'recently-updated': 'updated',
  'name-az': 'name',
};

export interface UserRepo {
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
  created_at: string;
  updated_at: string;
  list_id: number | null;
  collection_ids: number[];
  tags: string[];
  notes: string | null;
  starred_at: string | null;
  is_starred?: boolean;
  is_saved?: boolean;
  star_growth_30d?: number | null;
}

interface ListFacet {
  id: number;
  name: string;
  color: string;
  count: number;
}

export interface Facets {
  languages: [string, number][];
  lists: ListFacet[];
  tags: [string, number][];
}

interface StarsResponse {
  repos: UserRepo[];
  total: number;
  facets: Facets;
}

export interface SyncResult {
  added: { id: number; full_name: string; description: string | null }[];
  removed: { id: number; full_name: string; description: string | null }[];
  importedLists: string[];
  assignedRepos: number;
  totalRepos: number;
  unchanged: boolean;
}

export interface UseStarredReposOptions {
  q?: string;
  language?: string[];
  listId?: number | null;
  sort?: SortOption;
  limit?: number;
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | false | undefined
): void {
  if (value) params.set(key, value);
}

function buildStarsUrl(opts: UseStarredReposOptions, offset: number): string {
  const params = new URLSearchParams();
  appendParam(params, 'q', opts.q);
  appendParam(params, 'language', opts.language?.length ? opts.language.join(',') : undefined);
  if (opts.listId != null) params.set('list_id', String(opts.listId));
  const apiSort = sortMap[opts.sort ?? 'recently-starred'];
  appendParam(params, 'sort', apiSort !== 'starred' ? apiSort : undefined);
  const limit = opts.limit ?? 50;
  appendParam(params, 'limit', limit !== 50 ? String(limit) : undefined);
  appendParam(params, 'offset', offset > 0 ? String(offset) : undefined);
  const qs = params.toString();
  const query = qs ? `?${qs}` : '';
  return `/api/stars${query}`;
}

// Serialize filter options to a stable key for detecting filter changes
function filterKey(opts: UseStarredReposOptions): string {
  return JSON.stringify({
    q: opts.q ?? '',
    lang: opts.language ?? [],
    list: opts.listId ?? null,
    sort: opts.sort ?? 'recently-starred',
  });
}

interface SyncHelpers {
  setSyncing: (v: boolean) => void;
  setSyncResult: (r: SyncResult | null) => void;
  setSyncError: (e: string | null) => void;
  setLoadedRepos: React.Dispatch<React.SetStateAction<UserRepo[]>>;
  mutate: () => Promise<unknown>;
  globalMutate: (key: string) => Promise<unknown>;
}

async function performSync(helpers: SyncHelpers): Promise<SyncResult | null> {
  helpers.setSyncing(true);
  helpers.setSyncResult(null);
  helpers.setSyncError(null);
  try {
    const res = await fetch('/api/stars/sync', { method: 'POST' });
    if (!res.ok) {
      helpers.setSyncError(syncErrorMessage(res.status));
      return null;
    }
    const result: SyncResult = await res.json();
    helpers.setSyncResult(result);
    helpers.setLoadedRepos([]);
    await Promise.all([helpers.mutate(), helpers.globalMutate('/api/lists')]);
    fetch('/api/embeddings/generate', { method: 'POST' }).catch(() => {});
    return result;
  } catch (err) {
    console.error('Star sync failed', err);
    helpers.setSyncError(
      "Couldn't reach GitHub to sync your stars. Check your connection and try again."
    );
    return null;
  } finally {
    helpers.setSyncing(false);
  }
}

export function useStarredRepos(opts: UseStarredReposOptions = {}) {
  const { mutate: globalMutate } = useSWRConfig();
  const [loadedRepos, setLoadedRepos] = useState<UserRepo[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const prevFilterKey = useRef(filterKey(opts));
  const searchAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const currentFilterKey = filterKey(opts);

  const url = buildStarsUrl(opts, 0);
  const { data, error, isLoading, isValidating, mutate } = useSWR<StarsResponse>(
    url,
    (requestUrl: string) => replaceAbortableJsonRequest<StarsResponse>(searchAbortRef, requestUrl),
    starsSwrOptions()
  );

  useEffect(() => {
    if (currentFilterKey !== prevFilterKey.current) {
      prevFilterKey.current = currentFilterKey;
      loadMoreAbortRef.current?.abort();
      setLoadedRepos([]);
    }
  }, [currentFilterKey]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      loadMoreAbortRef.current?.abort();
    },
    []
  );

  const firstPageRepos = data?.repos ?? [];
  const allRepos = [...firstPageRepos, ...loadedRepos];
  const total = data?.total ?? 0;
  const hasMore = allRepos.length < total;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchStarsPage(opts, allRepos.length, loadMoreAbortRef);
      setLoadedRepos((prev) => [...prev, ...page.repos]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      throw e;
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, allRepos.length, opts]);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const sync = () =>
    performSync({
      setSyncing,
      setSyncResult,
      setSyncError,
      setLoadedRepos,
      mutate,
      globalMutate,
    });

  const dismissSyncResult = () => setSyncResult(null);
  const dismissSyncError = () => setSyncError(null);

  return {
    repos: allRepos,
    total,
    facets: data?.facets ?? { languages: [], lists: [], tags: [] },
    error,
    isLoading: isLoading && allRepos.length === 0,
    isValidating,
    loadingMore,
    hasMore,
    loadMore,
    syncing,
    sync,
    syncResult,
    syncError,
    dismissSyncResult,
    dismissSyncError,
    mutate,
  };
}

function starsSwrOptions() {
  return {
    revalidateOnFocus: false,
    dedupingInterval: 60000 * 5,
    keepPreviousData: true,
    errorRetryCount: 1,
    onError: (err: Error) => {
      // Don't let SWR retry aborted requests
      if (err?.name === 'AbortError') return;
    },
  };
}

async function fetchStarsPage(
  opts: UseStarredReposOptions,
  offset: number,
  abortRef: RefObject<AbortController | null>
): Promise<StarsResponse> {
  abortRef.current?.abort();
  abortRef.current = new AbortController();
  const nextUrl = buildStarsUrl(opts, offset);
  const res = await fetch(nextUrl, { signal: abortRef.current.signal });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as StarsResponse;
}

function syncErrorMessage(status: number): string {
  if (status === 401) return 'Sign in with GitHub again to sync your stars.';
  return "Couldn't sync your GitHub stars. Try again in a moment.";
}
