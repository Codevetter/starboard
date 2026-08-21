'use client';

import { ArrowLeft, ArrowUpRight, ExternalLink, Loader2, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import useSWRInfinite from 'swr/infinite';

import { TopBar } from '@/components/top-bar';
import {
  ToolIntelligenceGuide,
  type ToolScope,
  ToolScopeSelector,
} from '@/components/tool-intelligence-guide';
import { jsonFetcher } from '@/lib/swr-fetcher';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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

interface ToolRepoCardProps {
  repo: ToolRepo;
}

function ToolRepoCard({ repo }: ToolRepoCardProps) {
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

interface ToolRepoGridProps {
  repos: ToolRepo[];
  isInitialLoading: boolean;
}

function ToolRepoGrid({ repos, isInitialLoading }: ToolRepoGridProps) {
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
        <ToolRepoCard key={repo.id} repo={repo} />
      ))}
    </div>
  );
}

interface ToolDetailHeaderProps {
  tool: ToolSummary | undefined;
  decodedToolKey: string;
}

function ToolDetailHeader({ tool, decodedToolKey }: ToolDetailHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/tools">
            <ArrowLeft className="size-4" />
            Tools
          </Link>
        </Button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {tool?.toolName ?? decodedToolKey}
            </h1>
            {tool && (
              <>
                <Badge variant="outline" className={confidenceClass(tool.avgConfidence)}>
                  {confidenceLabel(tool.avgConfidence)}
                </Badge>
                <Badge variant="secondary">{tool.category}</Badge>
                <Badge variant="secondary">
                  {formatNumber(tool.repoCount)}{' '}
                  {tool.repoCount === 1 ? 'repository' : 'repositories'}
                </Badge>
              </>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Repositories where Starboard detected this tool, framework, build system, or platform.
          </p>
        </div>
      </div>
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

interface ScopeFilterProps {
  scope: ToolScope;
  minStars: number;
  isAuthenticated: boolean;
  onScopeChange: (scope: ToolScope) => void;
}

interface QueryFilterProps {
  query: string;
  onQueryChange: (value: string) => void;
  minConfidence: number;
  onToggleConfidence: () => void;
}

interface ToolFilterControlsProps {
  scopeProps: ScopeFilterProps;
  queryProps: QueryFilterProps;
}

function ToolFilterControls({ scopeProps, queryProps }: ToolFilterControlsProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <ToolScopeSelector
        scope={scopeProps.scope}
        minStars={scopeProps.minStars}
        isAuthenticated={scopeProps.isAuthenticated}
        onScopeChange={scopeProps.onScopeChange}
      />
      <div className="flex flex-col gap-2 sm:flex-row lg:min-w-[520px]">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={queryProps.query}
            onChange={(event) => queryProps.onQueryChange(event.target.value)}
            placeholder="Filter repositories..."
            aria-label="Filter repositories with this tool"
            className="pl-9"
          />
        </div>
        <Button
          variant={queryProps.minConfidence >= 90 ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={queryProps.onToggleConfidence}
        >
          <ShieldCheck className="size-4" />
          High confidence
        </Button>
      </div>
    </div>
  );
}

interface ToolLoadMoreButtonProps {
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

function ToolLoadMoreButton({ canLoadMore, isLoadingMore, onLoadMore }: ToolLoadMoreButtonProps) {
  if (!canLoadMore) return null;
  return (
    <div className="flex justify-center border-t pt-4">
      <Button type="button" variant="outline" disabled={isLoadingMore} onClick={onLoadMore}>
        {isLoadingMore && <Loader2 className="size-4 animate-spin" />}
        {isLoadingMore ? 'Loading more…' : `Load ${PAGE_SIZE} more`}
      </Button>
    </div>
  );
}

interface LoadingState {
  isInitialLoading: boolean;
  isValidating: boolean;
  isLoadingMore: boolean;
}

interface DataState {
  error: Error | undefined;
  pages: ToolReposResponse[] | undefined;
  tool: ToolSummary | undefined;
  repos: ToolRepo[];
}

function ToolStatusMessages({ loading, data }: { loading: LoadingState; data: DataState }) {
  const { isInitialLoading, isValidating, isLoadingMore } = loading;
  const { error, pages, tool, repos } = data;
  return (
    <>
      {isValidating && pages && !isLoadingMore && (
        <div className="text-sm text-muted-foreground">Refreshing tool repositories...</div>
      )}

      {!isInitialLoading && !error && tool && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing {repos.length.toLocaleString()} of {tool.repoCount.toLocaleString()} matching
          repositories.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          Tool repositories could not load.
        </div>
      )}

      {!isInitialLoading && !error && repos.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No repositories match this scope and filter.
        </p>
      )}
    </>
  );
}

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
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <TopBar
        title="Tool Intelligence"
        description="Inspect tools and the repository evidence behind each detection."
      />

      <section className="space-y-4 p-4 md:p-6">
        <ToolDetailHeader tool={tool} decodedToolKey={decodedToolKey} />
        <ToolIntelligenceGuide disclaimer={pages?.[0]?.disclaimer} />

        <ToolFilterControls
          scopeProps={{
            scope,
            minStars: pages?.[0]?.minStars ?? 10_000,
            isAuthenticated,
            onScopeChange: setScope,
          }}
          queryProps={{
            query,
            onQueryChange: setQuery,
            minConfidence,
            onToggleConfidence: () => setMinConfidence((value) => (value >= 90 ? 0 : 90)),
          }}
        />

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
    </main>
  );
}
