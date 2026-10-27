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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { useRepoDetail } from '@/hooks/use-repo-detail';
import { getAvatarImageAttrs } from '@/lib/avatar';
import { formatCompactCount, languageColor, timeAgo } from '@/lib/repo-display';

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface RepoTool {
  toolKey: string;
  toolName: string;
  category: string;
  url: string;
  confidence: number;
  sources: string[];
}

export interface RepoToolsResponse {
  disclaimer: string;
  tools: RepoTool[];
}

export interface StarHistoryPoint {
  stargazersCount: number;
  capturedAt: string;
}

export interface StarHistoryGrowth {
  starsGained: number | null;
  percentGrowth: number | null;
  enoughHistory: boolean;
}

export interface StarHistoryResponse {
  points: StarHistoryPoint[];
  growth: StarHistoryGrowth;
}

export function confidenceClass(value: number): string {
  if (value >= 90)
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (value >= 65) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

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

export interface SimilarRepoItem {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  similarity: number;
}

export interface RepoHeaderCardProps {
  repo: NonNullable<ReturnType<typeof useRepoDetail>['repo']>;
  isAuthenticated: boolean;
}

export function RepoHeaderCard({ repo, isAuthenticated }: RepoHeaderCardProps) {
  const langColor = languageColor(repo.language);
  const ownerAvatar = getAvatarImageAttrs(repo.owner_avatar, 40);
  const backHref = isAuthenticated ? '/stars' : '/discover';
  const backLabel = isAuthenticated ? 'Back to Library' : 'Back to Discover';

  return (
    <>
      <Link
        href={backHref}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ownerAvatar.src}
              srcSet={ownerAvatar.srcSet}
              sizes={ownerAvatar.sizes}
              alt={repo.owner_login}
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-full"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{repo.owner_login}</p>
              <h1 className="truncate text-base font-semibold">{repo.name}</h1>
            </div>
          </div>

          <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="size-3.5" />
              View on GitHub
            </Button>
          </a>
        </div>

        {repo.description && (
          <p className="mt-4 leading-relaxed text-muted-foreground">{repo.description}</p>
        )}

        {repo.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {repo.topics.map((topic) => (
              <Badge key={topic} variant="secondary" className="text-xs font-normal">
                {topic}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
            <span className="font-medium text-foreground">
              {formatCompactCount(repo.stargazers_count)}
            </span>
            <span>stars</span>
          </div>
          {repo.language && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: langColor ?? undefined }}
              />
              <span>{repo.language}</span>
            </div>
          )}
          {repo.archived && (
            <div className="flex items-center gap-1.5">
              <Archive className="size-3.5" />
              <span>Archived</span>
            </div>
          )}
          {repo.repo_updated_at && (
            <div className="flex items-center gap-1.5">
              <GitFork className="size-3.5" />
              <span>Updated {timeAgo(repo.repo_updated_at)}</span>
            </div>
          )}
          {repo.repo_created_at && (
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              <span>Created {formatDate(repo.repo_created_at)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export interface RepoSecondaryDataProps {
  starHistory: StarHistoryResponse | undefined;
  repoTools: RepoToolsResponse | undefined;
}

export function RepoSecondaryData({ starHistory, repoTools }: RepoSecondaryDataProps) {
  if (!starHistory && (repoTools?.tools.length ?? 0) === 0) return null;
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-2">
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
    </div>
  );
}

export interface SimilarRepoCardProps {
  repo: SimilarRepoItem;
}

export function SimilarRepoCard({ repo }: SimilarRepoCardProps) {
  const langColor = languageColor(repo.language);
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
              {formatCompactCount(repo.stargazers_count)}
            </span>
            <span className="ml-auto tabular-nums">{Math.round(repo.similarity * 100)}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export interface SimilarReposSectionProps {
  similar: SimilarRepoItem[];
  similarLoading: boolean;
}

export function SimilarReposSection({ similar, similarLoading }: SimilarReposSectionProps) {
  if (!similarLoading && similar.length === 0) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="size-3.5 text-primary" />
        Similar projects
      </h2>
      {similarLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {similar.map((s) => (
            <SimilarRepoCard key={s.id} repo={s} />
          ))}
        </div>
      )}
    </div>
  );
}
