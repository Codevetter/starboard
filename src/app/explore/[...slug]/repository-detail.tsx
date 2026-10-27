'use client';

import {
  SimilarReposSection,
  SimilarRepoCard,
  SimilarRepoCardProps,
  SimilarRepoItem,
  SimilarReposSectionProps,
  RepoSecondaryData,
  confidenceClass,
  MiniStarHistory,
  formatDate,
  type StarHistoryResponse,
  StarHistoryGrowth,
  StarHistoryPoint,
  RepoSecondaryDataProps,
  type RepoToolsResponse,
  RepoTool,
  RepoHeaderCard,
  RepoHeaderCardProps,
} from '@/components/public-source/repository';

import {
  Archive,
  ArrowLeft,
  Calendar,
  ExternalLink,
  GitFork,
  Info,
  Sparkles,
  Star,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TopBar } from '@/components/top-bar';
import { useRepoDetail } from '@/hooks/use-repo-detail';
import { useSimilarRepos } from '@/hooks/use-similar-repos';
import { getAvatarImageAttrs } from '@/lib/avatar';
import { formatCompactCount, languageColor, timeAgo } from '@/lib/repo-display';
import { jsonFetcher } from '@/lib/swr-fetcher';
import type { RepoDetail } from '@/lib/repo-detail';

function PageSkeleton() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <TopBar
        title="Repository Intelligence"
        description="Inspect repository evidence and related projects."
      />
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <Skeleton className="mb-6 h-8 w-20" />
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-1.5 h-3.5 w-28" />
              </div>
            </div>
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="mt-6 flex gap-4 border-t pt-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-1.5 h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function ErrorState({ error }: { error: Error | undefined }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <TopBar
        title="Repository Intelligence"
        description="Inspect repository evidence and related projects."
      />
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <Link
          href="/stars"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            {error ? 'Failed to load repository.' : 'Repository not found.'}
          </p>
        </div>
      </div>
    </main>
  );
}

function useRepoPageData(repoSlug: string, initialRepo: RepoDetail) {
  const { repo, isLoading, error } = useRepoDetail(repoSlug, initialRepo);
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

  return { repo, isLoading, error, similar, similarLoading, starHistory, repoTools };
}

export default function RepositoryDetail({
  repoSlug,
  initialRepo,
}: {
  repoSlug: string;
  initialRepo: RepoDetail;
}) {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const { repo, isLoading, error, similar, similarLoading, starHistory, repoTools } =
    useRepoPageData(repoSlug, initialRepo);

  if (isLoading) return <PageSkeleton />;
  if (!repo) return <ErrorState error={error} />;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <TopBar
        title="Repository Intelligence"
        description="Inspect repository evidence and related projects."
      />
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <RepoHeaderCard repo={repo} isAuthenticated={isAuthenticated} />
        <RepoSecondaryData starHistory={starHistory} repoTools={repoTools} />
        <SimilarReposSection similar={similar} similarLoading={similarLoading} />
      </div>
    </main>
  );
}
