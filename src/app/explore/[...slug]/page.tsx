'use client';

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
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TopBar } from '@/components/top-bar';
import { useRepoDetail } from '@/hooks/use-repo-detail';
import { useSimilarRepos } from '@/hooks/use-similar-repos';
import { getAvatarImageAttrs } from '@/lib/avatar';
import { jsonFetcher } from '@/lib/swr-fetcher';

const languageColors: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Shell: '#89e051',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Zig: '#ec915c',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatStarCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  }
  return count.toString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface RepoTool {
  toolKey: string;
  toolName: string;
  category: string;
  url: string;
  confidence: number;
  sources: string[];
}

interface RepoToolsResponse {
  disclaimer: string;
  tools: RepoTool[];
}

interface StarHistoryResponse {
  points: Array<{ stargazersCount: number; capturedAt: string }>;
  growth: {
    starsGained: number | null;
    percentGrowth: number | null;
    enoughHistory: boolean;
  };
}

function confidenceClass(value: number): string {
  if (value >= 90)
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (value >= 65) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

function MiniStarHistory({ history }: { history: StarHistoryResponse }) {
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

function PageSkeleton() {
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

export default function RepoDetailPage() {
  const params = useParams();
  const slugParts = params.slug as string[];
  const repoSlug = slugParts?.length === 2 ? `${slugParts[0]}/${slugParts[1]}` : '';
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const { repo, isLoading, error } = useRepoDetail(repoSlug);

  // Stagger secondary requests after the main repo payload so a single page
  // open does not fire 4 concurrent /api/* calls (Cloudflare edge 429s).
  const [secondaryReady, setSecondaryReady] = useState(false);
  useEffect(() => {
    if (!repo?.id) {
      setSecondaryReady(false);
      return;
    }
    const timer = window.setTimeout(() => setSecondaryReady(true), 450);
    return () => window.clearTimeout(timer);
  }, [repo?.id]);

  const { similar, isLoading: similarLoading } = useSimilarRepos(repo?.id, 8, secondaryReady);
  const { data: starHistory } = useSWR<StarHistoryResponse>(
    secondaryReady && repo?.id ? `/api/repos/${repo.id}/star-history?days=180` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const { data: repoTools } = useSWR<RepoToolsResponse>(
    secondaryReady && repo?.id ? `/api/repos/${repo.id}/tools` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  if (!repoSlug) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">
        <TopBar
          title="Repository Intelligence"
          description="Inspect repository evidence and related projects."
        />
        <div className="mx-auto max-w-3xl p-4 md:p-6">
          <p className="text-muted-foreground">Invalid repository path. Use /explore/owner/repo</p>
        </div>
      </main>
    );
  }

  if (isLoading) return <PageSkeleton />;

  if (error || !repo) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">
        <TopBar
          title="Repository Intelligence"
          description="Inspect repository evidence and related projects."
        />
        <div className="mx-auto max-w-3xl p-4 md:p-6">
          <Link
            href="/stars"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              {error ? 'Failed to load repository.' : 'Repository not found.'}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const langColor = repo.language ? (languageColors[repo.language] ?? '#8b8b8b') : null;
  const ownerAvatar = getAvatarImageAttrs(repo.owner_avatar, 40);
  const backHref = isAuthenticated ? '/stars' : '/discover';
  const backLabel = isAuthenticated ? 'Back to Library' : 'Back to Discover';

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <TopBar
        title="Repository Intelligence"
        description="Inspect repository evidence and related projects."
      />
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        {/* Back link */}
        <Link
          href={backHref}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>

        {/* Repo header card */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            {/* Owner + name */}
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

            {/* GitHub CTA */}
            <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="size-3.5" />
                View on GitHub
              </Button>
            </a>
          </div>

          {/* Description */}
          {repo.description && (
            <p className="mt-4 leading-relaxed text-muted-foreground">{repo.description}</p>
          )}

          {/* Topics */}
          {repo.topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {repo.topics.map((topic) => (
                <Badge key={topic} variant="secondary" className="text-xs font-normal">
                  {topic}
                </Badge>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-foreground">
                {formatStarCount(repo.stargazers_count)}
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

        {(starHistory || (repoTools?.tools.length ?? 0) > 0) && (
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
                        <Link href={`/tools/${encodeURIComponent(tool.toolKey)}`}>
                          {tool.toolName}
                        </Link>
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
        )}

        {/* Similar repos */}
        {(similarLoading || similar.length > 0) && (
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
                {similar.map((s) => {
                  const langColor = s.language ? (languageColors[s.language] ?? '#8b8b8b') : null;
                  const avatar = getAvatarImageAttrs(s.owner.avatar_url, 24);
                  return (
                    <Link
                      key={s.id}
                      href={`/explore/${s.full_name}`}
                      className="group rounded-xl border bg-card p-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-start gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={avatar.src}
                          srcSet={avatar.srcSet}
                          sizes={avatar.sizes}
                          alt={s.owner.login}
                          width={24}
                          height={24}
                          className="size-6 shrink-0 rounded-full"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            <span className="text-muted-foreground">{s.owner.login}/</span>
                            {s.name}
                          </p>
                          {s.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {s.description}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                            {s.language && (
                              <span className="flex items-center gap-1">
                                <span
                                  className="inline-block size-2 rounded-full"
                                  style={{ backgroundColor: langColor ?? undefined }}
                                />
                                {s.language}
                              </span>
                            )}
                            <span className="flex items-center gap-0.5">
                              <Star className="size-3 fill-current" />
                              {formatStarCount(s.stargazers_count)}
                            </span>
                            <span className="ml-auto tabular-nums">
                              {Math.round(s.similarity * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
