import { ArrowLeft, ArrowUpRight, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { ToolScope } from '@/components/tool-intelligence-guide';
import { formatCompactCount } from '@/lib/repo-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export interface ToolSummary {
  toolKey: string;
  toolName: string;
  category: string;
  url: string;
  repoCount: number;
  avgConfidence: number;
  maxConfidence: number;
}

export interface ToolRepo {
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

export interface ToolReposResponse {
  scope: ToolScope;
  minStars: number;
  disclaimer: string;
  tool: ToolSummary;
  repos: ToolRepo[];
  page: { offset: number; limit: number; hasMore: boolean };
}

export const PAGE_SIZE = 48;

export function confidenceLabel(value: number): string {
  if (value >= 90) return 'High confidence';
  if (value >= 65) return 'Medium confidence';
  return 'Inferred';
}

export function confidenceClass(value: number): string {
  if (value >= 90)
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (value >= 65) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

export interface ToolRepoCardProps {
  repo: ToolRepo;
}

export function ToolRepoCard({ repo }: ToolRepoCardProps) {
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
          <Badge variant="secondary">{formatCompactCount(repo.stargazers_count)} stars</Badge>
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

export interface ToolRepoGridProps {
  repos: ToolRepo[];
  isInitialLoading: boolean;
}

export function ToolRepoGrid({ repos, isInitialLoading }: ToolRepoGridProps) {
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

export interface ToolDetailHeaderProps {
  tool: ToolSummary | undefined;
  decodedToolKey: string;
}

export function ToolDetailHeader({ tool, decodedToolKey }: ToolDetailHeaderProps) {
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
                  {formatCompactCount(tool.repoCount)}{' '}
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

export interface ToolLoadMoreButtonProps {
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export function ToolLoadMoreButton({
  canLoadMore,
  isLoadingMore,
  onLoadMore,
}: ToolLoadMoreButtonProps) {
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

export interface LoadingState {
  isInitialLoading: boolean;
  isValidating: boolean;
  isLoadingMore: boolean;
}

export interface DataState {
  error: Error | undefined;
  pages: ToolReposResponse[] | undefined;
  tool: ToolSummary | undefined;
  repos: ToolRepo[];
}

export function ToolStatusMessages({ loading, data }: { loading: LoadingState; data: DataState }) {
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
