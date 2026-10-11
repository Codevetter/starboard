'use client';

import useSWR from 'swr';

import type { RepoDetail, RepoDetailResponse } from '@/lib/repo-detail';

import { jsonFetcher } from '@/lib/swr-fetcher';

export function useRepoDetail(slug: string, initialRepo?: RepoDetail) {
  const { data, error, isLoading } = useSWR<RepoDetailResponse>(
    slug ? `/api/repos/lookup?name=${encodeURIComponent(slug)}` : null,
    jsonFetcher,
    { fallbackData: initialRepo ? { repo: initialRepo } : undefined }
  );

  return {
    repo: data?.repo ?? null,
    isLoading: !data && isLoading,
    error,
  };
}
