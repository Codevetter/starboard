'use client';

import {
  ArrowUpRight,
  ExternalLink,
  Info,
  Loader2,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { jsonFetcher } from '@/lib/swr-fetcher';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type ToolScope = 'discover' | 'user' | 'all';

interface ToolSummary {
  toolKey: string;
  toolName: string;
  category: string;
  url: string;
  repoCount: number;
  avgConfidence: number;
  maxConfidence: number;
}

interface ToolsResponse {
  scope: ToolScope;
  minStars: number;
  minConfidence: number;
  disclaimer: string;
  tools: ToolSummary[];
}

const fetcher = jsonFetcher;

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function confidenceLabel(value: number): string {
  if (value >= 90) return 'High';
  if (value >= 65) return 'Medium';
  return 'Inferred';
}

function confidenceClass(value: number): string {
  if (value >= 90)
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (value >= 65) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

export default function ToolsPage() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ToolsContent isAuthenticated={status === 'authenticated'} />;
}

function ToolsContent({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [scope, setScope] = useState<ToolScope>('discover');
  const [minConfidence, setMinConfidence] = useState(0);
  const [query, setQuery] = useState('');
  const apiUrl = `/api/tools?scope=${scope}&min_confidence=${minConfidence}&min_stars=10000&limit=300`;
  const { data, error, isLoading, isValidating } = useSWR<ToolsResponse>(apiUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const isInitialLoading = isLoading && !data;

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data?.tools ?? [];
    return (data?.tools ?? []).filter(
      (tool) =>
        tool.toolName.toLowerCase().includes(q) ||
        tool.toolKey.toLowerCase().includes(q) ||
        tool.category.toLowerCase().includes(q)
    );
  }, [data?.tools, query]);

  const totalRepoMentions = tools.reduce((sum, tool) => sum + tool.repoCount, 0);
  const highConfidenceTools = tools.filter((tool) => tool.avgConfidence >= 90).length;
  const categoryCount = new Set(tools.map((tool) => tool.category)).size;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 px-4 py-3 backdrop-blur-sm md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md border">
              <Wrench className="size-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Tool Intelligence</h1>
              <p className="text-sm text-muted-foreground">
                Tools, frameworks, build systems, and platforms detected across repositories.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/radar" prefetch={false}>
                Radar
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/discover" prefetch={false}>
                Discover
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/stars" prefetch={false}>
                Library
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="space-y-4 p-4 md:p-6">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              {data?.disclaimer ??
                'Loading evidence-based tool intelligence from repository manifests and metadata.'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-semibold">
              {isInitialLoading ? (
                <span className="block h-8 w-16 animate-pulse rounded bg-muted" />
              ) : (
                formatNumber(tools.length)
              )}
            </div>
            <div className="text-sm text-muted-foreground">detected tools</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-semibold">
              {isInitialLoading ? (
                <span className="block h-8 w-20 animate-pulse rounded bg-muted" />
              ) : (
                formatNumber(totalRepoMentions)
              )}
            </div>
            <div className="text-sm text-muted-foreground">repo-tool matches</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-semibold">
              {isInitialLoading ? (
                <span className="block h-8 w-24 animate-pulse rounded bg-muted" />
              ) : (
                `${formatNumber(highConfidenceTools)} / ${formatNumber(categoryCount)}`
              )}
            </div>
            <div className="text-sm text-muted-foreground">high-confidence tools / categories</div>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['discover', 'user', 'all'] as const).map((value) => (
              <Button
                key={value}
                variant={scope === value ? 'default' : 'outline'}
                size="sm"
                disabled={value === 'user' && !isAuthenticated}
                onClick={() => setScope(value)}
              >
                {value === 'discover' ? '10k+ corpus' : value === 'user' ? 'My library' : 'All'}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:min-w-[520px]">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter tools..."
                className="pl-9"
              />
            </div>
            <Button
              variant={minConfidence >= 90 ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setMinConfidence((value) => (value >= 90 ? 0 : 90))}
            >
              <ShieldCheck className="size-4" />
              High confidence
            </Button>
          </div>
        </div>

        {isValidating && data && (
          <div className="text-sm text-muted-foreground">Refreshing tool intelligence...</div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            Tool usage could not load.
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {isInitialLoading
            ? Array.from({ length: 12 }).map((_, index) => (
                <Card
                  key={index}
                  className="h-40 animate-pulse rounded-lg bg-muted/40 py-4 shadow-none"
                />
              ))
            : tools.map((tool) => (
                <Link
                  key={tool.toolKey}
                  href={`/tools/${encodeURIComponent(tool.toolKey)}`}
                  className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium group-hover:underline">
                        {tool.toolName}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{tool.category}</div>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-2xl font-semibold">{formatNumber(tool.repoCount)}</div>
                      <div className="text-xs text-muted-foreground">repositories</div>
                    </div>
                    <Badge variant="outline" className={confidenceClass(tool.avgConfidence)}>
                      {confidenceLabel(tool.avgConfidence)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                    <span>{tool.avgConfidence}% avg confidence</span>
                    <span className="inline-flex items-center gap-1">
                      Link
                      <ExternalLink className="size-3" />
                    </span>
                  </div>
                </Link>
              ))}
        </section>
      </section>
    </main>
  );
}
