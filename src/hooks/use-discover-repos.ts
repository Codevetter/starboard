'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import useSWR from 'swr';

import type { Facets, SortOption, UserRepo } from '@/hooks/use-starred-repos';
import { replaceAbortableJsonRequest } from '@/lib/abortable-fetch';

const sortMap: Record<SortOption, string> = {
  relevance: 'relevance',
  'recently-starred': 'stars',
  'most-stars': 'stars',
  'fastest-growing': 'growth',
  'recently-updated': 'updated',
  'name-az': 'name',
};

interface DiscoverToolFacet {
  key: string;
  name: string;
  count: number;
}

interface DiscoverFacets extends Facets {
  tools: DiscoverToolFacet[];
}

export interface DiscoverResponse {
  repos: UserRepo[];
  total: number;
  facets: DiscoverFacets;
  minStars: number;
}

export interface UseDiscoverReposOptions {
  q?: string;
  language?: string[];
  listId?: number | null;
  tools?: string[];
  sort?: SortOption;
  limit?: number;
}

const EMPTY_FACETS: DiscoverFacets = {
  languages: [],
  lists: [],
  tags: [],
  tools: [],
};

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | false | undefined
): void {
  if (value) params.set(key, value);
}

function buildDiscoverUrl(opts: UseDiscoverReposOptions, offset: number): string {
  const params = new URLSearchParams();
  appendParam(params, 'q', opts.q);
  appendParam(params, 'language', opts.language?.length ? opts.language.join(',') : undefined);
  if (opts.listId != null) params.set('list_id', String(opts.listId));
  appendParam(params, 'tool', opts.tools?.length ? opts.tools.join(',') : undefined);
  const apiSort = sortMap[opts.sort ?? 'most-stars'];
  appendParam(params, 'sort', apiSort !== 'stars' ? apiSort : undefined);
  const limit = opts.limit ?? 50;
  appendParam(params, 'limit', limit !== 50 ? String(limit) : undefined);
  appendParam(params, 'offset', offset > 0 ? String(offset) : undefined);
  const qs = params.toString();
  const query = qs ? `?${qs}` : '';
  return `/discover/data${query}`;
}

function filterKey(opts: UseDiscoverReposOptions): string {
  return JSON.stringify({
    q: opts.q ?? '',
    lang: opts.language ?? [],
    list: opts.listId ?? null,
    tools: opts.tools ?? [],
    sort: opts.sort ?? 'most-stars',
  });
}

export function useDiscoverRepos(
  opts: UseDiscoverReposOptions = {},
  initial?: { data: DiscoverResponse | null; url: string }
) {
  const [loadedRepos, setLoadedRepos] = useState<UserRepo[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const prevFilterKey = useRef(filterKey(opts));
  const searchAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const currentFilterKey = filterKey(opts);

  const url = buildDiscoverUrl(opts, 0);
  const hasMatchingInitialData = initial?.data != null && initial.url === url;
  const { data, error, isLoading, isValidating, mutate } = useSWR<DiscoverResponse>(
    url,
    (requestUrl: string) =>
      replaceAbortableJsonRequest<DiscoverResponse>(searchAbortRef, requestUrl),
    discoverSwrOptions(searchAbortRef, hasMatchingInitialData, initial)
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
      const page = await fetchDiscoverPage(opts, allRepos.length, loadMoreAbortRef);
      setLoadedRepos((prev) => [...prev, ...page.repos]);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      throw error;
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, allRepos.length, opts]);

  return {
    repos: allRepos,
    total,
    facets: data?.facets ?? EMPTY_FACETS,
    minStars: data?.minStars ?? 5000,
    error,
    isLoading: isLoading && allRepos.length === 0,
    isValidating,
    loadingMore,
    hasMore,
    loadMore,
    mutate,
  };
}

function discoverSwrOptions(
  _searchAbortRef: RefObject<AbortController | null>,
  hasMatchingInitialData: boolean,
  initial?: { data: DiscoverResponse | null; url: string }
) {
  return {
    revalidateOnFocus: false,
    revalidateOnMount: !hasMatchingInitialData,
    dedupingInterval: 60000 * 5,
    keepPreviousData: true,
    fallbackData: hasMatchingInitialData ? (initial?.data ?? undefined) : undefined,
    shouldRetryOnError: false,
    onError: (err: Error) => {
      if (err?.name === 'AbortError') return;
    },
  };
}

async function fetchDiscoverPage(
  opts: UseDiscoverReposOptions,
  offset: number,
  abortRef: RefObject<AbortController | null>
): Promise<DiscoverResponse> {
  abortRef.current?.abort();
  abortRef.current = new AbortController();
  const nextUrl = buildDiscoverUrl(opts, offset);
  const res = await fetch(nextUrl, { signal: abortRef.current.signal });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as DiscoverResponse;
}
