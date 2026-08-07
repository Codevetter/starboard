'use client';

import useSWR from 'swr';

import { jsonFetcher } from '@/lib/swr-fetcher';

interface SimilarRepo {
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
  updated_at?: string | null;
  list_id: number | null;
  collection_ids?: number[];
  tags: string[];
  similarity: number;
}

interface Response {
  similar: SimilarRepo[];
  reason?: string;
}

export function useSimilarRepos(repoId: number | null | undefined, limit = 8, enabled = true) {
  const { data, error, isLoading } = useSWR<Response>(
    enabled && repoId ? `/api/repos/${repoId}/similar?limit=${limit}` : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000 * 10,
    }
  );

  return {
    similar: data?.similar ?? [],
    reason: data?.reason,
    isLoading,
    error,
  };
}
