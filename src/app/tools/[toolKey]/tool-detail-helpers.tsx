'use client';

import { ArrowLeft, ArrowUpRight, ExternalLink, Loader2, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWRInfinite from 'swr/infinite';

import {
  ToolIntelligenceGuide,
  type ToolScope,
  ToolScopeSelector,
} from '@/components/tool-intelligence-guide';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { jsonFetcher } from '@/lib/swr-fetcher';

interface ToolSummary {
  toolKey: string;
  toolName: string;
  category: string;
  url: string;
  repoCount: number;
  avgConfidence: number;
  maxConfidence: number;
}

interface ToolRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  tool: {
    toolName: string;
    category: string;
    url: string;
    confidence: number;
    sources: string[];
  };
}

interface ToolReposResponse {
  scope: ToolScope;
  minStars: number;
  disclaimer: string;
  tool: ToolSummary;
  repos: ToolRepo[];
  page: { offset: number; limit: number; hasMore: boolean };
}

const fetcher = jsonFetcher;
const PAGE_SIZE = 48;

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function confidenceLabel(value: number): string {
  if (value >= 90) return 'High confidence';
  if (value >= 65) return 'Medium confidence';
  return 'Inferred';
}

function confidenceClass(value: number): string {
  if (value >= 90)
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (value >= 65) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

export function useToolRepos(
  decodedToolKey: string,
  scope: ToolScope,
  minConfidence: number,
  debouncedQuery: string
) {
  const {
    data: pages,
    error,
    isLoading,
    isValidating,
    size,
    setSize,
  } = useSWRInfinite<ToolReposResponse>(
    (pageIndex, previousPage) => {
      if (previousPage && !previousPage.page.hasMore) return null;
      const search = new URLSearchParams({
        scope,
        min_confidence: String(minConfidence),
        min_stars: '10000',
        tool: decodedToolKey,
        limit: String(PAGE_SIZE),
        offset: String(pageIndex * PAGE_SIZE),
      });
      if (debouncedQuery) search.set('q', debouncedQuery);
      return `/api/tools?${search.toString()}`;
    },
    fetcher,
    { revalidateOnFocus: false }
  );

  const repos = useMemo(() => {
    const seen = new Set<number>();
    return (pages ?? []).flatMap((page) =>
      page.repos.filter((repo) => {
        if (seen.has(repo.id)) return false;
        seen.add(repo.id);
        return true;
      })
    );
  }, [pages]);

  const isInitialLoading = isLoading && !pages;
  const tool = pages?.[0]?.tool;
  const hasMore = pages?.at(-1)?.page.hasMore ?? false;
  const isLoadingMore = isValidating && Boolean(pages) && size > (pages?.length ?? 0);

  return {
    pages,
    error,
    isInitialLoading,
    isValidating,
    isLoadingMore,
    repos,
    tool,
    hasMore,
    setSize,
  };
}

export function ToolHeader({
  tool,
  decodedToolKey,
}: {
  tool: ToolSummary | undefined;
  decodedToolKey: string;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/tools">
          <ArrowLeft className="size-4" />
          Tools
        </Link>
      </Button>
      <ToolTitleSection tool={tool} decodedToolKey={decodedToolKey} />
    </div>
  );
}

function ToolTitleSection({
  tool,
  decodedToolKey,
}: {
  tool: ToolSummary | undefined;
  decodedToolKey: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tool?.toolName ?? decodedToolKey}
        </h1>
        {tool && <ToolBadges tool={tool} />}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Repositories where Starboard detected this tool, framework, build system, or platform.
      </p>
    </div>
  );
}

function ToolBadges({ tool }: { tool: ToolSummary }) {
  return (
    <>
      <Badge variant="outline" className={confidenceClass(tool.avgConfidence)}>
        {confidenceLabel(tool.avgConfidence)}
      </Badge>
      <Badge variant="secondary">{tool.category}</Badge>
      <Badge variant="secondary">
        {formatNumber(tool.repoCount)} {tool.repoCount === 1 ? 'repository' : 'repositories'}
      </Badge>
    </>
  );
}

export function RepoCard({ repo }: { repo: ToolRepo }) {
  return (
    <Card key={repo.id} className="rounded-lg py-4 shadow-none">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/explore/${repo.full_name}`}
              className="block truncate font-medium hover:underline"
            >
              {repo.full_name}
            </Link>
            {repo.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{repo.description}</p>
            )}
          </div>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${repo.full_name} on GitHub`}
          >
            <Link href={repo.html_url} target="_blank" rel="noreferrer">
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={confidenceClass(repo.tool.confidence)}>
            {repo.tool.confidence}% confidence
          </Badge>
          {repo.language && <Badge variant="secondary">{repo.language}</Badge>}
          <Badge variant="secondary">{formatNumber(repo.stargazers_count)} stars</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {repo.tool.sources.slice(0, 4).map((source) => (
            <Badge key={source} variant="outline" className="text-xs">
              {source}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RepoList({
  repos,
  isInitialLoading,
}: {
  repos: ToolRepo[];
  isInitialLoading: boolean;
}) {
  if (isInitialLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <Card
            key={index}
            className="h-40 animate-pulse rounded-lg bg-muted/40 py-4 shadow-none"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {repos.map((repo) => (
        <RepoCard key={repo.id} repo={repo} />
      ))}
    </div>
  );
}

export function LoadMoreButton({
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center border-t pt-4">
      <Button type="button" variant="outline" disabled={isLoadingMore} onClick={onLoadMore}>
        {isLoadingMore && <Loader2 className="size-4 animate-spin" />}
        {isLoadingMore ? 'Loading more…' : `Load ${PAGE_SIZE} more`}
      </Button>
    </div>
  );
}

interface FilterControlsProps {
  scope: ToolScope;
  minConfidence: number;
  query: string;
  setQuery: (value: string) => void;
  setMinConfidence: (fn: (value: number) => number) => void;
  minStars: number;
  isAuthenticated: boolean;
  setScope: (scope: ToolScope) => void;
}

function FilterSearchInput({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter repositories..."
        aria-label="Filter repositories with this tool"
        className="pl-9"
      />
    </div>
  );
}

export function FilterControls(props: FilterControlsProps) {
  const {
    scope,
    minConfidence,
    query,
    setQuery,
    setMinConfidence,
    minStars,
    isAuthenticated,
    setScope,
  } = props;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <ToolScopeSelector
        scope={scope}
        minStars={minStars}
        isAuthenticated={isAuthenticated}
        onScopeChange={setScope}
      />
      <div className="flex flex-col gap-2 sm:flex-row lg:min-w-[520px]">
        <FilterSearchInput query={query} setQuery={setQuery} />
        <Button
          variant={minConfidence >= 90 ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={() => setMinConfidence((v) => (v >= 90 ? 0 : 90))}
        >
          <ShieldCheck className="size-4" />
          High confidence
        </Button>
      </div>
    </div>
  );
}

export function useDebouncedQuery(initial: string) {
  const [query, setQuery] = useState(initial);
  const [debouncedQuery, setDebouncedQuery] = useState(initial);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  return { query, setQuery, debouncedQuery };
}

export function ToolDetailHeader({
  tool,
  decodedToolKey,
}: {
  tool: ToolSummary | undefined;
  decodedToolKey: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <ToolHeader tool={tool} decodedToolKey={decodedToolKey} />
      {tool?.url && (
        <Button asChild variant="outline" size="sm">
          <Link href={tool.url} target="_blank" rel="noreferrer">
            Tool link
            <ExternalLink className="size-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

interface ToolStatusMessagesProps {
  isValidating: boolean;
  pages: ToolReposResponse[] | undefined;
  isLoadingMore: boolean;
  isInitialLoading: boolean;
  error: unknown;
  tool: ToolSummary | undefined;
  reposLength: number;
}

export function ToolStatusMessages(props: ToolStatusMessagesProps) {
  const { isValidating, pages, isLoadingMore, isInitialLoading, error, tool, reposLength } = props;
  return (
    <>
      {isValidating && pages && !isLoadingMore && (
        <div className="text-sm text-muted-foreground">Refreshing tool repositories...</div>
      )}
      {!isInitialLoading && !error && tool && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing {reposLength.toLocaleString()} of {tool.repoCount.toLocaleString()} matching
          repositories.
        </p>
      )}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          Tool repositories could not load.
        </div>
      )}
    </>
  );
}

export function EmptyStateMessage({
  isInitialLoading,
  error,
  reposLength,
}: {
  isInitialLoading: boolean;
  error: unknown;
  reposLength: number;
}) {
  if (isInitialLoading || error || reposLength > 0) return null;
  return (
    <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      No repositories match this scope and filter.
    </p>
  );
}
