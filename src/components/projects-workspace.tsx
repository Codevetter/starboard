'use client';

import {
  ArrowUpRight,
  BookOpen,
  FolderGit2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ConnectedProject } from '@/lib/connected-projects';
import type {
  GroundedToolRecommendation,
  ProjectRecommendation,
} from '@/lib/project-recommendations';
import { jsonFetcher } from '@/lib/swr-fetcher';

interface ProjectsResponse {
  projects: ConnectedProject[];
}

interface RecommendationsResponse {
  project: ConnectedProject;
  similarProjects: ProjectRecommendation[];
  recommendedTools: GroundedToolRecommendation[];
  fallback: boolean;
  context: {
    language: string | null;
    topics: string[];
    tools: ConnectedProject['tools'];
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background" aria-busy="true">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </main>
  );
}

function ProjectNav() {
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Product">
      <Button asChild variant="ghost" size="sm">
        <Link href="/discover" prefetch={false}>
          <Search className="size-4" />
          Discover
        </Link>
      </Button>
      <Button variant="secondary" size="sm">
        <FolderGit2 className="size-4" />
        Projects
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href="/tools" prefetch={false}>
          <Wrench className="size-4" />
          Tools
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href="/stars" prefetch={false}>
          <BookOpen className="size-4" />
          Library
        </Link>
      </Button>
    </nav>
  );
}

function ConnectProjectForm({ onConnected }: { onConnected: (project: ConnectedProject) => void }) {
  const [repository, setRepository] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository }),
      });
      const payload = (await response.json()) as { project?: ConnectedProject; error?: string };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error || 'Project could not be connected.');
      }
      setRepository('');
      onConnected(payload.project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Project could not be connected.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={repository}
          onChange={(event) => setRepository(event.target.value)}
          placeholder="github.com/owner/repository"
          aria-label="Public GitHub repository"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button type="submit" disabled={busy || !repository.trim()} className="shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Connect project
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Free. Public repositories only, with the current minimal GitHub permission.
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function RecommendationCard({ recommendation }: { recommendation: ProjectRecommendation }) {
  return (
    <Card className="rounded-lg py-4 shadow-none">
      <CardHeader className="gap-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              <Link href={`/explore/${recommendation.fullName}`} className="hover:underline">
                {recommendation.fullName}
              </Link>
            </CardTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recommendation.language && (
                <Badge variant="secondary">{recommendation.language}</Badge>
              )}
              <Badge variant="outline">{formatNumber(recommendation.stargazersCount)} stars</Badge>
            </div>
          </div>
          <Button asChild variant="ghost" size="icon-sm">
            <Link
              href={recommendation.htmlUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${recommendation.fullName} on GitHub`}
            >
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {recommendation.description ?? 'No repository description is available.'}
        </p>
        <ul className="space-y-1.5 text-sm">
          {recommendation.evidence.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GroundedToolCard({ recommendation }: { recommendation: GroundedToolRecommendation }) {
  return (
    <Card className="rounded-lg py-4 shadow-none">
      <CardHeader className="gap-2 px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{recommendation.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{recommendation.category}</p>
          </div>
          <Badge variant="secondary">
            {recommendation.supportCount} similar{' '}
            {recommendation.supportCount === 1 ? 'repo' : 'repos'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        <p className="text-xs font-medium text-muted-foreground">Grounded in repository evidence</p>
        <ul className="space-y-1.5 text-sm">
          {recommendation.sources.slice(0, 4).map((source) => (
            <li key={source.repoId} className="flex items-center justify-between gap-3">
              <Link
                href={`/explore/${source.fullName}`}
                className="min-w-0 truncate hover:underline"
              >
                {source.fullName}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                {Math.round(source.confidence)}% detection
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ProjectsWorkspace({ selectedSlug }: { selectedSlug?: string }) {
  const { status } = useSession();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<ProjectsResponse>(
    status === 'authenticated' ? '/api/projects' : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  );
  const projects = data?.projects ?? [];
  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === selectedSlug) ?? projects[0] ?? null,
    [projects, selectedSlug]
  );
  const [disconnectId, setDisconnectId] = useState<number | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const recommendationUrl = selectedProject
    ? `/api/projects/${selectedProject.id}/recommendations?limit=24`
    : null;
  const {
    data: recommendations,
    error: recommendationError,
    isLoading: recommendationsLoading,
  } = useSWR<RecommendationsResponse>(recommendationUrl, jsonFetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?callbackUrl=%2Fprojects');
    }
  }, [router, status]);

  useEffect(() => {
    if (selectedProject && selectedSlug !== String(selectedProject.id)) {
      router.replace(`/projects/${selectedProject.id}`);
    }
  }, [router, selectedProject, selectedSlug]);

  async function disconnect(project: ConnectedProject) {
    if (disconnectId !== project.id) {
      setDisconnectId(project.id);
      return;
    }
    setDisconnecting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Project could not be disconnected.');
      setDisconnectId(null);
      await mutate(
        { projects: projects.filter((item) => item.id !== project.id) },
        { revalidate: false }
      );
      router.replace('/projects');
    } finally {
      setDisconnecting(false);
    }
  }

  function connected(project: ConnectedProject) {
    const nextProjects = [project, ...projects.filter((item) => item.id !== project.id)];
    mutate({ projects: nextProjects }, { revalidate: false });
    router.push(`/projects/${project.id}`);
  }

  if (status === 'loading' || (status === 'authenticated' && isLoading && !data)) {
    return <LoadingScreen />;
  }
  if (status === 'unauthenticated') return <LoadingScreen />;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 px-4 py-3 backdrop-blur-sm md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Projects</h1>
            <p className="text-sm text-muted-foreground">
              Discover tools for what you are building.
            </p>
          </div>
          <ProjectNav />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[18rem_minmax(0,1fr)] md:px-6">
        <aside className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-medium">Connect a GitHub project</h2>
            <ConnectProjectForm onConnected={connected} />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Connected</h2>
              <span className="text-xs text-muted-foreground">{projects.length}</span>
            </div>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Connected projects could not load.
              </p>
            )}
            {projects.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Connect a public repository to get project-aware recommendations.
              </div>
            ) : (
              <nav
                className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1"
                aria-label="Connected projects"
              >
                {projects.map((project) => {
                  const active = selectedProject?.id === project.id;
                  return (
                    <Button
                      key={project.id}
                      asChild
                      variant={active ? 'secondary' : 'ghost'}
                      className="h-auto min-w-56 justify-start px-3 py-2 text-left md:w-full md:min-w-0"
                    >
                      <Link href={`/projects/${project.id}`}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{project.fullName}</span>
                          <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                            {project.language ?? 'Language not detected'}
                          </span>
                        </span>
                      </Link>
                    </Button>
                  );
                })}
              </nav>
            )}
          </section>
        </aside>

        <section className="min-w-0">
          {!selectedProject ? (
            <div className="flex min-h-[28rem] flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl border bg-card">
                <FolderGit2 className="size-5" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">Start with a project</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Add a public GitHub repository. Starboard will use its language, topics, metadata,
                and detected tools to explain useful matches from the public catalog.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-semibold">{selectedProject.fullName}</h2>
                    {selectedProject.language && (
                      <Badge variant="secondary">{selectedProject.language}</Badge>
                    )}
                  </div>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    {selectedProject.description ?? 'No repository description is available.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedProject.topics.slice(0, 6).map((topic) => (
                      <Badge key={topic} variant="outline">
                        {topic}
                      </Badge>
                    ))}
                    {selectedProject.tools.slice(0, 5).map((tool) => (
                      <Badge key={tool.key} variant="outline">
                        {tool.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={selectedProject.htmlUrl} target="_blank" rel="noreferrer">
                      GitHub
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    variant={disconnectId === selectedProject.id ? 'destructive' : 'outline'}
                    size="sm"
                    disabled={disconnecting}
                    onClick={() => disconnect(selectedProject)}
                  >
                    {disconnecting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    {disconnectId === selectedProject.id ? 'Confirm' : 'Disconnect'}
                  </Button>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Similar projects</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The grounding set for recommendations, ranked by visible repository evidence.
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/discover" prefetch={false}>
                      Browse all
                    </Link>
                  </Button>
                </div>

                {recommendations?.fallback && (
                  <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    This project has limited context, so these are broad discovery picks. Tool
                    enrichment will make future matches more specific.
                  </p>
                )}
                {recommendationError && (
                  <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    Recommendations could not load. Try again shortly.
                  </p>
                )}
                {recommendationsLoading && !recommendations && (
                  <div className="flex min-h-56 items-center justify-center" aria-busy="true">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {recommendations && recommendations.similarProjects.length === 0 && (
                  <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No eligible catalog matches yet. Browse Discover while the public corpus grows.
                  </div>
                )}
                {recommendations && recommendations.similarProjects.length > 0 && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {recommendations.similarProjects.map((recommendation) => (
                      <RecommendationCard key={recommendation.id} recommendation={recommendation} />
                    ))}
                  </div>
                )}
              </div>

              {recommendations && !recommendations.fallback && (
                <div>
                  <div>
                    <h3 className="text-base font-semibold">Tools used by similar projects</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Free recommendations derived only from detected tools in the grounded peers
                      above.
                    </p>
                  </div>
                  {recommendations.recommendedTools.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      No additional tools are grounded strongly enough yet.
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                      {recommendations.recommendedTools.map((recommendation) => (
                        <GroundedToolCard
                          key={recommendation.key}
                          recommendation={recommendation}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
