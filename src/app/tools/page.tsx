'use client';

import { ArrowUpRight, Info, Loader2, Search, ShieldCheck, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type ToolScope = 'discover' | 'user' | 'all';

interface ToolSummary {
  toolKey: string;
  toolName: string;
  category: string;
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

interface ToolRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  tool: {
    toolName: string;
    category: string;
    confidence: number;
    sources: string[];
  };
}

interface ToolReposResponse {
  disclaimer: string;
  repos: ToolRepo[];
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

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
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/');
  }, [router, status]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'unauthenticated') return null;

  return <ToolsContent />;
}

function ToolsContent() {
  const [scope, setScope] = useState<ToolScope>('discover');
  const [minConfidence, setMinConfidence] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const apiUrl = `/api/tools?scope=${scope}&min_confidence=${minConfidence}&min_stars=10000&limit=120`;
  const { data, error, isLoading } = useSWR<ToolsResponse>(apiUrl, fetcher, {
    revalidateOnFocus: false,
  });
  const detailUrl = selectedTool
    ? `/api/tools?scope=${scope}&min_confidence=${minConfidence}&min_stars=10000&tool=${encodeURIComponent(selectedTool)}&limit=50`
    : null;
  const { data: detail, isLoading: detailLoading } = useSWR<ToolReposResponse>(detailUrl, fetcher, {
    revalidateOnFocus: false,
  });

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

  const selectedToolSummary = tools.find((tool) => tool.toolKey === selectedTool);

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
              <Link href="/radar">Radar</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/discover">Discover</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/stars">Library</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="space-y-4 p-4 md:p-6">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>{data?.disclaimer ?? detail?.disclaimer}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['discover', 'user', 'all'] as const).map((value) => (
              <Button
                key={value}
                variant={scope === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setScope(value);
                  setSelectedTool(null);
                }}
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

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            Tool usage could not load.
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {isLoading
              ? Array.from({ length: 9 }).map((_, index) => (
                  <Card key={index} className="h-32 rounded-lg py-4 shadow-none" />
                ))
              : tools.map((tool) => (
                  <button
                    key={tool.toolKey}
                    type="button"
                    onClick={() => setSelectedTool(tool.toolKey)}
                    className={`rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 ${
                      selectedTool === tool.toolKey
                        ? 'border-primary/60 ring-1 ring-primary/20'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{tool.toolName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{tool.category}</div>
                      </div>
                      <Badge variant="outline" className={confidenceClass(tool.avgConfidence)}>
                        {confidenceLabel(tool.avgConfidence)}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Repositories</span>
                      <span className="font-semibold">{formatNumber(tool.repoCount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>avg confidence</span>
                      <span>{tool.avgConfidence}%</span>
                    </div>
                  </button>
                ))}
          </section>

          <Card className="rounded-lg py-4 shadow-none">
            <CardHeader className="px-4">
              <CardTitle className="text-base">
                {selectedToolSummary ? selectedToolSummary.toolName : 'Select a tool'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              {!selectedTool && (
                <p className="text-sm text-muted-foreground">
                  Choose a tool to see repositories and the evidence Starboard found.
                </p>
              )}
              {detailLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading repositories
                </div>
              )}
              {detail?.repos.map((repo) => (
                <div key={repo.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/explore/${repo.full_name}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {repo.full_name}
                      </Link>
                      {repo.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {repo.description}
                        </p>
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
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={confidenceClass(repo.tool.confidence)}>
                      {repo.tool.confidence}% confidence
                    </Badge>
                    {repo.tool.sources.slice(0, 3).map((source) => (
                      <Badge key={source} variant="secondary" className="text-xs">
                        {source}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
