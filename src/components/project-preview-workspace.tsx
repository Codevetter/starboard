'use client';

import {
  PreviewStatusSections,
  PreviewStatusData,
  type PreviewResponse,
  PreviewForm,
} from '@/components/public-source/project-preview';

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
import { normalizeGitHubProjectLocation } from '@/lib/github-projects';
import type { ProjectIntelligenceResult } from '@/lib/project-intelligence';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';
import { retrievalCoverageMessage, reviewedMatchesLabel } from '@/lib/retrieval-coverage';
import { FetchHttpError, jsonFetcher } from '@/lib/swr-fetcher';

function retrievalCopy(mode: RecommendationRetrievalMode): string {
  if (mode === 'hybrid') return 'Broad evidence match';
  if (mode === 'semantic') return 'Meaning-based match';
  if (mode === 'lexical-structured') return 'Catalog-context match';
  if (mode === 'structured') return 'Language match';
  return 'Broad public-catalog fallback';
}

function PreviewHeader({ loginHref }: { loginHref: string }) {
  return (
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
  );
}

interface PreviewResultsProps {
  data: PreviewResponse;
  loginHref: string;
  showAllPeers: boolean;
  setShowAllPeers: React.Dispatch<React.SetStateAction<boolean>>;
}

function PreviewProjectHeader({
  data,
  loginHref,
}: Pick<PreviewResultsProps, 'data' | 'loginHref'>) {
  return (
    <section className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-2xl font-semibold">{data.project.fullName}</h2>
          {data.project.language && <Badge variant="secondary">{data.project.language}</Badge>}
          <Badge variant="outline">
            {data.quality?.status === 'reviewed'
              ? reviewedMatchesLabel(data.similarProjects.length, data.retrieval)
              : retrievalCopy(data.retrieval.mode)}
          </Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {data.project.description ?? 'No repository description is available.'}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {data.project.sourceContext?.files.length
            ? `Checked ${data.project.sourceContext.files.length} public product documents and manifest files${data.project.sourceContext.status === 'partial' ? ' (partial coverage)' : ''}.`
            : 'Project files could not be checked. Matches use repository metadata; tool suggestions are withheld.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.project.tools.slice(0, 8).map((tool) => (
            <Badge key={tool.key} variant="outline">
              {tool.name}
            </Badge>
          ))}
        </div>
      </div>
      <Button asChild className="shrink-0">
        <Link href={loginHref}>Sign in to connect</Link>
      </Button>
    </section>
  );
}

function PreviewResults({ data, loginHref, showAllPeers, setShowAllPeers }: PreviewResultsProps) {
  return (
    <div className="space-y-10">
      <PreviewProjectHeader data={data} loginHref={loginHref} />

      {retrievalCoverageMessage(data.retrieval) && (
        <p role="status" className="text-sm text-muted-foreground">
          {retrievalCoverageMessage(data.retrieval)}
        </p>
      )}

      {data.fallback && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          {data.quality?.status === 'unavailable'
            ? data.quality.reason === 'insufficient-context'
              ? 'There is not enough project context to review matches. Add a README describing the product, or choose a folder with its own README.'
              : 'Relevance review is temporarily unavailable. Try again shortly; unreviewed matches are withheld.'
            : data.retrieval.unavailableSources?.length
              ? 'No sufficiently relevant matches were found in the available sources. Retrieval coverage is incomplete.'
              : 'No sufficiently relevant matches were found. Shared language or framework alone does not qualify a recommendation.'}
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
            No grounded catalog matches are available yet. Try another public project or browse
            Discover.
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
              Tools from related projects with a compatible runtime, excluding tools detected here.
              Evaluate fit before adopting.
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
  );
}

export function ProjectPreviewWorkspace({ initialRepository }: { initialRepository: string }) {
  const router = useRouter();
  const [repository, setRepository] = useState(initialRepository);
  const [showAllPeers, setShowAllPeers] = useState(false);
  const normalizedRepository = normalizeGitHubProjectLocation(initialRepository);
  const previewUrl = normalizedRepository
    ? `/api/project-preview?repository=${encodeURIComponent(normalizedRepository)}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<PreviewResponse>(previewUrl, jsonFetcher, {
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
    const value = normalizeGitHubProjectLocation(repository);
    if (!value) return;
    if (value === normalizedRepository) {
      void mutate();
    }
    router.push(`/project-preview?repository=${encodeURIComponent(value)}`);
  }

  const connectCallback = data
    ? `/projects?repository=${encodeURIComponent(data.project.fullName)}${data.project.sourceContext?.scope ? `&path=${encodeURIComponent(data.project.sourceContext.scope)}` : ''}`
    : '/projects';
  const loginHref = `/login?callbackUrl=${encodeURIComponent(connectCallback)}`;
  const previewLoginHref = `/login?callbackUrl=${encodeURIComponent(
    `/project-preview?repository=${encodeURIComponent(normalizedRepository)}`
  )}`;

  return (
    <main className="min-h-screen bg-background">
      <PreviewHeader loginHref={loginHref} />

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <PreviewForm repository={repository} onRepositoryChange={setRepository} onSubmit={submit} />

        <PreviewStatusSections
          statusData={{ initialRepository, isLoading, data, error }}
          previewLoginHref={previewLoginHref}
        />

        {data && (
          <PreviewResults
            data={data}
            loginHref={loginHref}
            showAllPeers={showAllPeers}
            setShowAllPeers={setShowAllPeers}
          />
        )}
      </div>
    </main>
  );
}
