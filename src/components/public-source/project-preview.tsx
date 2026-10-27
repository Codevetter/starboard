import { ArrowLeft, FolderGit2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProjectIntelligenceResult } from '@/lib/project-intelligence';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';
import { FetchHttpError } from '@/lib/swr-fetcher';

export interface PreviewResponse extends ProjectIntelligenceResult {
  project: ProjectRecommendationRepo;
  source: 'catalog' | 'github';
}

export function PreviewForm({
  repository,
  onRepositoryChange,
  onSubmit,
}: {
  repository: string;
  onRepositoryChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
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
          See similar open-source projects and the tools their peers use.{' '}
          {'Nothing is saved until you explicitly connect the project after GitHub sign-in.'}
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={repository}
          onChange={(event) => onRepositoryChange(event.target.value)}
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
  );
}

export interface PreviewStatusData {
  initialRepository: string;
  isLoading: boolean;
  data: PreviewResponse | undefined;
  error: Error | undefined;
}

export function PreviewStatusSections({
  statusData,
  previewLoginHref,
}: {
  statusData: PreviewStatusData;
  previewLoginHref: string;
}) {
  const { initialRepository, isLoading, data, error } = statusData;
  if (!initialRepository) {
    return (
      <section className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-card">
          <FolderGit2 className="size-5" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">Start with a repository you know</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Cataloged projects preview immediately. For a new repository, sign in so Starboard can use
          your GitHub session without spending a shared anonymous quota.
        </p>
      </section>
    );
  }
  if (isLoading && !data) {
    return (
      <section className="flex min-h-72 items-center justify-center" aria-busy="true">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only" role="status">
          Loading project recommendations
        </span>
      </section>
    );
  }
  if (error) {
    return (
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
    );
  }
  return null;
}
