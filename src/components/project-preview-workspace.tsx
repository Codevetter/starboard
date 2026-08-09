'use client';

import { ArrowLeft, FolderGit2, Loader2, Search, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';

import {
  GroundedToolRecommendationCard,
  ProjectRecommendationCard,
} from '@/components/project-recommendation-cards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackRecommendationSetViewed, type RecommendationRetrievalMode } from '@/lib/analytics';
import type { ProjectIntelligenceResult } from '@/lib/project-intelligence';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';
import { FetchHttpError, jsonFetcher } from '@/lib/swr-fetcher';

interface PreviewResponse extends ProjectIntelligenceResult {
  project: ProjectRecommendationRepo;
  source: 'catalog' | 'github';
}

function retrievalCopy(mode: RecommendationRetrievalMode): string {
  if (mode === 'hybrid') return 'Broad evidence match';
  if (mode === 'semantic') return 'Meaning-based match';
  if (mode === 'lexical-structured') return 'Catalog-context match';
  if (mode === 'structured') return 'Language match';
  return 'Broad public-catalog fallback';
}

export function ProjectPreviewWorkspace({ initialRepository }: { initialRepository: string }) {
  const router = useRouter();
  const [repository, setRepository] = useState(initialRepository);
  const [showAllPeers, setShowAllPeers] = useState(false);
  const previewUrl = initialRepository
    ? `/api/project-preview?repository=${encodeURIComponent(initialRepository)}`
    : null;
  const { data, error, isLoading } = useSWR<PreviewResponse>(previewUrl, jsonFetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (!data) return;
    trackRecommendationSetViewed(data.retrieval.mode, data.similarProjects.length, data.fallback);
  }, [data]);

  useEffect(() => {
    setShowAllPeers(false);
  }, [initialRepository]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = repository.trim();
    if (!value) return;
    router.push(`/project-preview?repository=${encodeURIComponent(value)}`);
  }

  const connectCallback = data
    ? `/projects?repository=${encodeURIComponent(data.project.fullName)}`
    : '/projects';
  const loginHref = `/login?callbackUrl=${encodeURIComponent(connectCallback)}`;
  const previewLoginHref = `/login?callbackUrl=${encodeURIComponent(
    `/project-preview?repository=${encodeURIComponent(initialRepository)}`
  )}`;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background/90 px-4 py-3 backdrop-blur-sm md:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg border">★</span>
            Starboard
          </Link>
          <nav className="flex items-center gap-1" aria-label="Public product">
            <Button asChild variant="ghost" size="sm">
              <Link href="/discover" prefetch={false}>
                <Search className="size-4" />
                Discover
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/tools" prefetch={false}>
                <Wrench className="size-4" />
                Tools
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={loginHref}>Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <section className="max-w-3xl space-y-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Starboard
          </Link>
          <div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Preview tool intelligence for a public project
            </h1>
            <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
              See similar open-source projects and the tools their peers use. Nothing is saved until
              you explicitly connect the project after GitHub sign-in.
            </p>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              placeholder="github.com/owner/repository"
              aria-label="Public GitHub repository"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-11"
            />
            <Button type="submit" disabled={!repository.trim()} className="h-11 shrink-0">
              Preview project
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Public repositories only. Preview is read-only and creates no project, list, or note.
          </p>
        </section>

        {!initialRepository && (
          <section className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border bg-card">
              <FolderGit2 className="size-5" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">Start with a repository you know</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Cataloged projects preview immediately. For a new repository, sign in so Starboard can
              use your GitHub session without spending a shared anonymous quota.
            </p>
          </section>
        )}

        {initialRepository && isLoading && !data && (
          <section className="flex min-h-72 items-center justify-center" aria-busy="true">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="sr-only" role="status">
              Loading project recommendations
            </span>
          </section>
        )}

        {error && (
          <section
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-5"
            role="alert"
          >
            <h2 className="font-semibold">This project could not be previewed</h2>
            <p className="mt-1 text-sm text-destructive">
              {error instanceof Error ? error.message : 'Try another public GitHub repository.'}
            </p>
            {error instanceof FetchHttpError && error.status === 401 && (
              <Button asChild className="mt-4" size="sm">
                <Link href={previewLoginHref}>Sign in to preview</Link>
              </Button>
            )}
          </section>
        )}

        {data && (
          <div className="space-y-10">
            <section className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-semibold">{data.project.fullName}</h2>
                  {data.project.language && (
                    <Badge variant="secondary">{data.project.language}</Badge>
                  )}
                  <Badge variant="outline">{retrievalCopy(data.retrieval.mode)}</Badge>
                </div>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  {data.project.description ?? 'No repository description is available.'}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Context source:{' '}
                  {data.source === 'catalog'
                    ? 'Starboard catalog evidence'
                    : 'public GitHub metadata'}
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link href={loginHref}>Sign in to connect</Link>
              </Button>
            </section>

            {data.fallback && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                This project has limited matching context. These are broad catalog picks, and no
                tool recommendation is presented as grounded.
              </p>
            )}

            <section>
              <div>
                <h2 className="text-lg font-semibold">Similar projects</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A focused preview from the public catalog, reranked by visible project evidence.
                </p>
              </div>
              {data.similarProjects.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No grounded catalog matches are available yet. Try another public project or
                  browse Discover.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {(showAllPeers ? data.similarProjects : data.similarProjects.slice(0, 3)).map(
                    (recommendation, index) => (
                      <ProjectRecommendationCard
                        key={recommendation.id}
                        recommendation={recommendation}
                        rank={index + 1}
                        retrievalMode={data.retrieval.mode}
                      />
                    )
                  )}
                </div>
              )}
              {data.similarProjects.length > 3 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowAllPeers((value) => !value)}
                >
                  {showAllPeers
                    ? 'Show the strongest matches only'
                    : `Show ${data.similarProjects.length - 3} more matches`}
                </Button>
              )}
            </section>

            {!data.fallback && (
              <section>
                <div>
                  <h2 className="text-lg font-semibold">Tools to evaluate</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Each suggestion comes only from detected tools in the similar projects above.
                  </p>
                </div>
                {data.recommendedTools.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No additional tools are grounded strongly enough yet.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {data.recommendedTools.map((recommendation, index) => (
                      <GroundedToolRecommendationCard
                        key={recommendation.key}
                        recommendation={recommendation}
                        rank={index + 1}
                        retrievalMode={data.retrieval.mode}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
