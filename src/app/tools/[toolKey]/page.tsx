'use client';

import {
  ToolLoadMoreButton,
  PAGE_SIZE,
  ToolLoadMoreButtonProps,
  ToolStatusMessages,
  DataState,
  type ToolRepo,
  ToolSummary,
  type ToolReposResponse,
  LoadingState,
  ToolRepoGrid,
  ToolRepoCard,
  confidenceClass,
  ToolRepoCardProps,
  ToolRepoGridProps,
  ToolDetailHeader,
  confidenceLabel,
  ToolDetailHeaderProps,
} from '@/components/public-source/tool-detail';

import { ArrowLeft, ArrowUpRight, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import useSWRInfinite from 'swr/infinite';

import { WorkspaceLayout } from '@/components/workspace-layout';
import {
  ToolIntelligenceGuide,
  type ToolScope,
  ToolFiltersSidebar,
} from '@/components/tool-intelligence-guide';
import { formatCompactCount } from '@/lib/repo-display';
import { jsonFetcher } from '@/lib/swr-fetcher';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const fetcher = jsonFetcher;

interface ToolSearchConfig {
  scope: ToolScope;
  minConfidence: number;
  decodedToolKey: string;
}

function buildToolSearchUrl(
  config: ToolSearchConfig,
  pageIndex: number,
  debouncedQuery: string
): string {
  const search = new URLSearchParams({
    scope: config.scope,
    min_confidence: String(config.minConfidence),
    min_stars: '10000',
    tool: config.decodedToolKey,
    limit: String(PAGE_SIZE),
    offset: String(pageIndex * PAGE_SIZE),
  });
  if (debouncedQuery) search.set('q', debouncedQuery);
  return `/api/tools?${search.toString()}`;
}

function dedupeRepos(pages: ToolReposResponse[] | undefined): ToolRepo[] {
  const seen = new Set<number>();
  return (pages ?? []).flatMap((page) =>
    page.repos.filter((repo) => {
      if (seen.has(repo.id)) return false;
      seen.add(repo.id);
      return true;
    })
  );
}

function createSwrKey(
  scope: ToolScope,
  minConfidence: number,
  decodedToolKey: string,
  debouncedQuery: string
) {
  return (pageIndex: number, previousPage: ToolReposResponse | null): string | null => {
    if (previousPage && !previousPage.page.hasMore) return null;
    return buildToolSearchUrl({ scope, minConfidence, decodedToolKey }, pageIndex, debouncedQuery);
  };
}

function parseToolKey(params: { toolKey?: string[] | string }): string {
  const raw = Array.isArray(params.toolKey) ? params.toolKey[0] : params.toolKey;
  return decodeURIComponent(raw ?? '');
}

function useToolDetailState() {
  const params = useParams<{ toolKey: string }>();
  const { status } = useSession();
  const [scope, setScope] = useState<ToolScope>('discover');
  const [minConfidence, setMinConfidence] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const decodedToolKey = parseToolKey(params);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const {
    data: pages,
    error,
    isLoading,
    isValidating,
    size,
    setSize,
  } = useSWRInfinite<ToolReposResponse>(
    createSwrKey(scope, minConfidence, decodedToolKey, debouncedQuery),
    fetcher,
    { revalidateOnFocus: false }
  );

  const isInitialLoading = isLoading && !pages;
  const repos = useMemo(() => dedupeRepos(pages), [pages]);
  const isAuthenticated = status === 'authenticated';
  const tool = pages?.[0]?.tool;
  const hasMore = pages?.at(-1)?.page.hasMore ?? false;
  const isLoadingMore = isValidating && Boolean(pages) && size > (pages?.length ?? 0);

  return {
    scope,
    setScope,
    minConfidence,
    setMinConfidence,
    query,
    setQuery,
    decodedToolKey,
    pages,
    error,
    isInitialLoading,
    isValidating,
    isLoadingMore,
    isAuthenticated,
    tool,
    hasMore,
    repos,
    setSize,
  };
}

export default function ToolDetailPage() {
  const {
    scope,
    setScope,
    minConfidence,
    setMinConfidence,
    query,
    setQuery,
    decodedToolKey,
    pages,
    error,
    isInitialLoading,
    isValidating,
    isLoadingMore,
    isAuthenticated,
    tool,
    hasMore,
    repos,
    setSize,
  } = useToolDetailState();

  return (
    <WorkspaceLayout
      title="Tools"
      description="Inspect tools and the repository evidence behind each detection."
      searchQuery={query}
      onSearchChange={setQuery}
      searchPlaceholder="Filter repositories..."
      sidebarLabel="Tool filters"
      sidebar={
        <ToolFiltersSidebar
          scope={scope}
          minStars={pages?.[0]?.minStars ?? 10_000}
          isAuthenticated={isAuthenticated}
          onScopeChange={setScope}
          minConfidence={minConfidence}
          onToggleConfidence={() => setMinConfidence((value) => (value >= 90 ? 0 : 90))}
        />
      }
    >
      <section className="space-y-4">
        <ToolDetailHeader tool={tool} decodedToolKey={decodedToolKey} />
        <ToolIntelligenceGuide disclaimer={pages?.[0]?.disclaimer} />

        <ToolStatusMessages
          loading={{ isInitialLoading, isValidating, isLoadingMore }}
          data={{ error, pages, tool, repos }}
        />

        <ToolRepoGrid repos={repos} isInitialLoading={isInitialLoading} />

        <ToolLoadMoreButton
          canLoadMore={!error && hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={() => setSize((current) => current + 1)}
        />
      </section>
    </WorkspaceLayout>
  );
}
