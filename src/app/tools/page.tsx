'use client';

import { ArrowUpRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { WorkspaceLayout } from '@/components/workspace-layout';
import {
  ToolIntelligenceGuide,
  type ToolScope,
  ToolFiltersSidebar,
} from '@/components/tool-intelligence-guide';
import { formatCompactCount } from '@/lib/repo-display';
import { jsonFetcher } from '@/lib/swr-fetcher';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

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

function ToolCard({ tool }: { tool: ToolSummary }) {
  return (
    <Link
      key={tool.toolKey}
      href={`/tools/${encodeURIComponent(tool.toolKey)}`}
      className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium group-hover:underline">{tool.toolName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{tool.category}</div>
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">{formatCompactCount(tool.repoCount)}</div>
          <div className="text-xs text-muted-foreground">repositories</div>
        </div>
        <Badge variant="outline" className={confidenceClass(tool.avgConfidence)}>
          {confidenceLabel(tool.avgConfidence)}
        </Badge>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span>{tool.avgConfidence}% avg confidence</span>
        <span>View evidence</span>
      </div>
    </Link>
  );
}

function ToolGrid({
  tools,
  isInitialLoading,
}: {
  tools: ToolSummary[];
  isInitialLoading: boolean;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {isInitialLoading
        ? Array.from({ length: 12 }).map((_, index) => (
            <Card
              key={index}
              className="h-40 animate-pulse rounded-lg bg-muted/40 py-4 shadow-none"
            />
          ))
        : tools.map((tool) => <ToolCard key={tool.toolKey} tool={tool} />)}
    </section>
  );
}

function filterTools(tools: ToolSummary[], query: string): ToolSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  return tools.filter(
    (tool) =>
      tool.toolName.toLowerCase().includes(q) ||
      tool.toolKey.toLowerCase().includes(q) ||
      tool.category.toLowerCase().includes(q)
  );
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

  const tools = useMemo(() => filterTools(data?.tools ?? [], query), [data?.tools, query]);

  return (
    <WorkspaceLayout
      title="Tools"
      description="Inspect tools and the repository evidence behind each detection."
      searchQuery={query}
      onSearchChange={setQuery}
      searchPlaceholder="Filter tools..."
      sidebarLabel="Tool filters"
      sidebar={
        <ToolFiltersSidebar
          scope={scope}
          minStars={data?.minStars ?? 10_000}
          isAuthenticated={isAuthenticated}
          onScopeChange={setScope}
          minConfidence={minConfidence}
          onToggleConfidence={() => setMinConfidence((value) => (value >= 90 ? 0 : 90))}
        />
      }
    >
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">Tool intelligence</h1>
        <ToolIntelligenceGuide disclaimer={data?.disclaimer} />

        {isValidating && data && (
          <div className="text-sm text-muted-foreground">Refreshing tool intelligence...</div>
        )}

        {!isInitialLoading && !error && (
          <p className="text-sm text-muted-foreground">
            {tools.length} {tools.length === 1 ? 'tool' : 'tools'} match this view. Open a tool to
            inspect repository-level evidence.
          </p>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            Tool usage could not load.
          </div>
        )}

        <ToolGrid tools={tools} isInitialLoading={isInitialLoading} />

        {!isInitialLoading && !error && tools.length === 0 && (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No detected tools match this scope and filter.
          </p>
        )}
      </section>
    </WorkspaceLayout>
  );
}
