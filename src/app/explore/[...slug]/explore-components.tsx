'use client';

import { Info, TrendingUp, Wrench } from 'lucide-react';
import Link from 'next/link';
import { Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TopBar } from '@/components/top-bar';
import { getAvatarImageAttrs } from '@/lib/avatar';
import {
  confidenceClass,
  type RepoToolsResponse,
  type StarHistoryResponse,
  formatDate,
  formatStarCount,
  getLanguageColor,
} from './explore-helpers';

export function MiniStarHistory({ history }: { history: StarHistoryResponse }) {
  const points = history.points.slice(-24);
  const values = points.map((point) => point.stargazersCount);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  if (!history.growth.enoughHistory || points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Collecting star history. Rankings appear after at least two snapshots.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-16 items-end gap-1">
        {points.map((point) => (
          <div
            key={`${point.capturedAt}-${point.stargazersCount}`}
            className="min-w-1 flex-1 rounded-t bg-primary/70"
            style={{ height: `${18 + ((point.stargazersCount - min) / range) * 46}px` }}
            title={`${point.stargazersCount.toLocaleString()} stars on ${formatDate(point.capturedAt)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <Badge variant="outline">+{(history.growth.starsGained ?? 0).toLocaleString()} stars</Badge>
        {history.growth.percentGrowth !== null && (
          <Badge variant="outline">{history.growth.percentGrowth.toFixed(1)}% growth</Badge>
        )}
      </div>
    </div>
  );
}

export function PageSkeleton() {
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

interface DetectedToolsSectionProps {
  repoTools: RepoToolsResponse | undefined;
}

export function DetectedToolsSection({ repoTools }: DetectedToolsSectionProps) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Wrench className="size-3.5 text-primary" />
        Detected tools
      </h2>
      {repoTools?.tools.length ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {repoTools.tools.slice(0, 12).map((tool) => (
              <Badge
                asChild
                key={tool.toolKey}
                variant="outline"
                className={confidenceClass(tool.confidence)}
                title={`${tool.confidence}% confidence from ${tool.sources.join(', ')}`}
              >
                <Link href={`/tools/${encodeURIComponent(tool.toolKey)}`}>{tool.toolName}</Link>
              </Badge>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{repoTools.disclaimer}</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No detected tools yet.</p>
      )}
    </div>
  );
}

interface StarHistorySectionProps {
  starHistory: StarHistoryResponse | undefined;
}

export function StarHistorySection({ starHistory }: StarHistorySectionProps) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <TrendingUp className="size-3.5 text-primary" />
        Star history
      </h2>
      {starHistory ? (
        <MiniStarHistory history={starHistory} />
      ) : (
        <p className="text-sm text-muted-foreground">No snapshots available yet.</p>
      )}
    </div>
  );
}

interface SimilarRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  similarity: number;
  owner: { login: string; avatar_url: string };
}

export function SimilarRepoCard({ repo }: { repo: SimilarRepo }) {
  const langColor = getLanguageColor(repo.language);
  const avatar = getAvatarImageAttrs(repo.owner.avatar_url, 24);
  return (
    <Link
      key={repo.id}
      href={`/explore/${repo.full_name}`}
      className="group rounded-xl border bg-card p-3 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-start gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar.src}
          srcSet={avatar.srcSet}
          sizes={avatar.sizes}
          alt={repo.owner.login}
          width={24}
          height={24}
          className="size-6 shrink-0 rounded-full"
          loading="lazy"
          decoding="async"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            <span className="text-muted-foreground">{repo.owner.login}/</span>
            {repo.name}
          </p>
          {repo.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{repo.description}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
            {repo.language && (
              <span className="flex items-center gap-1">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: langColor ?? undefined }}
                />
                {repo.language}
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Star className="size-3 fill-current" />
              {formatStarCount(repo.stargazers_count)}
            </span>
            <span className="ml-auto tabular-nums">{Math.round(repo.similarity * 100)}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
