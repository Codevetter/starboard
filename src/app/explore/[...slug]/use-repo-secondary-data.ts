'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { useSimilarRepos } from '@/hooks/use-similar-repos';
import { jsonFetcher } from '@/lib/swr-fetcher';

import type { RepoToolsResponse, StarHistoryResponse } from './explore-helpers';

interface RepoLike {
  id: number;
}

export function useRepoSecondaryData<T extends RepoLike>(repo: T | null | undefined) {
  const [secondaryReady, setSecondaryReady] = useState(false);
  useEffect(() => {
    if (!repo?.id) {
      setSecondaryReady(false);
      return;
    }
    const timer = window.setTimeout(() => setSecondaryReady(true), 450);
    return () => window.clearTimeout(timer);
  }, [repo?.id]);

  const { similar, isLoading: similarLoading } = useSimilarRepos(repo?.id, 8, secondaryReady);
  const { data: starHistory } = useSWR<StarHistoryResponse>(
    secondaryReady && repo?.id ? `/api/repos/${repo.id}/star-history?days=180` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const { data: repoTools } = useSWR<RepoToolsResponse>(
    secondaryReady && repo?.id ? `/api/repos/${repo.id}/tools` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  return { similar, similarLoading, starHistory, repoTools };
}
