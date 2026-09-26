'use client';

import useSWR from 'swr';

import { jsonFetcher } from '@/lib/swr-fetcher';

export interface RepoDetailEntry {
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

interface RepoDetail {
  repo: RepoDetailEntry;
}

export function useRepoDetail(slug: string, initialRepo: RepoDetailEntry | null = null) {
  const { data, error, isLoading } = useSWR<RepoDetail>(
    slug ? `/api/repos/lookup?name=${encodeURIComponent(slug)}` : null,
    jsonFetcher,
    initialRepo ? { fallbackData: { repo: initialRepo } } : undefined
  );

  return {
    repo: data?.repo ?? null,
    isLoading: isLoading && !initialRepo,
    error,
  };
}
