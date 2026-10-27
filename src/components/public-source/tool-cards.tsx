import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { formatCompactCount } from '@/lib/repo-display';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export interface ToolSummary {
  toolKey: string;
  toolName: string;
  category: string;
  url: string;
  repoCount: number;
  avgConfidence: number;
  maxConfidence: number;
}

export function confidenceLabel(value: number): string {
  if (value >= 90) return 'High';
  if (value >= 65) return 'Medium';
  return 'Inferred';
}

export function confidenceClass(value: number): string {
  if (value >= 90)
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (value >= 65) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

export function ToolCard({ tool }: { tool: ToolSummary }) {
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

export function ToolGrid({
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
