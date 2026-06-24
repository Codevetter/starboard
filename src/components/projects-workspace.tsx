'use client';

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  FlaskConical,
  FolderKanban,
  Loader2,
  Search,
  SearchCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

import { ShareReportButton } from '@/components/share-report-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  FleetFeatureArea,
  FleetProjectRecommendationReport,
  FleetRecommendation,
  FleetRecommendationAction,
} from '@/lib/fleet-projects';

interface ProjectSummary {
  slug: string;
  name: string;
  description: string;
  tier: string;
  category: string;
  priority: string;
  maturity: 'public' | 'public-ready' | 'internal-first';
  featureAreas: FleetFeatureArea[];
  stack: {
    languages: string[];
    frameworks: string[];
    dependenciesCount: number;
  };
}

interface ProjectsResponse {
  projects: ProjectSummary[];
}

interface ProjectsWorkspaceProps {
  selectedSlug?: string;
}

const emptyProjects: ProjectSummary[] = [];

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function actionLabel(action: FleetRecommendationAction): string {
  if (action === 'use-now') return 'Use now';
  if (action === 'prototype') return 'Prototype';
  if (action === 'research') return 'Research';
  return 'Skip';
}

function actionClass(action: FleetRecommendationAction): string {
  if (action === 'use-now')
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (action === 'prototype')
    return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  if (action === 'research')
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-muted bg-muted/30 text-muted-foreground';
}

function actionIcon(action: FleetRecommendationAction) {
  if (action === 'use-now') return <CheckCircle2 className="size-3.5" />;
  if (action === 'prototype') return <FlaskConical className="size-3.5" />;
  if (action === 'research') return <SearchCheck className="size-3.5" />;
  return <AlertTriangle className="size-3.5" />;
}

function maturityLabel(maturity: ProjectSummary['maturity']): string {
  if (maturity === 'public') return 'Public';
  if (maturity === 'public-ready') return 'Public-ready';
  return 'Internal-first';
}

function recommendationSortValue(recommendation: FleetRecommendation): number {
  if (recommendation.action === 'use-now') return 0;
  if (recommendation.action === 'prototype') return 1;
  if (recommendation.action === 'research') return 2;
  return 3;
}

function RecommendationCard({ recommendation }: { recommendation: FleetRecommendation }) {
  return (
    <Card className="rounded-lg py-4 shadow-none">
      <CardHeader className="gap-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className={actionClass(recommendation.action)}>
                {actionIcon(recommendation.action)}
                {actionLabel(recommendation.action)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                score {recommendation.score}
              </Badge>
              {recommendation.language && (
                <Badge variant="secondary" className="text-xs">
                  {recommendation.language}
                </Badge>
              )}
            </div>
            <CardTitle className="mt-3 truncate text-base">
              <Link href={`/explore/${recommendation.fullName}`} className="hover:underline">
                {recommendation.fullName}
              </Link>
            </CardTitle>
          </div>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${recommendation.fullName} on GitHub`}
          >
            <Link href={recommendation.htmlUrl} target="_blank" rel="noreferrer">
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {recommendation.description ?? 'No description available.'}
        </p>
        <div className="rounded-md border bg-background/60 p-3 text-sm">
          {recommendation.suggestedUse}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {recommendation.reasons.map((reason) => (
            <Badge key={reason} variant="outline" className="text-xs text-muted-foreground">
              {reason}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs">
            {formatNumber(recommendation.stargazersCount)} stars
          </Badge>
          {recommendation.semanticDistance !== null && (
            <Badge variant="outline" className="text-xs">
              semantic {recommendation.semanticDistance.toFixed(2)}
            </Badge>
          )}
          {recommendation.cautions.map((caution) => (
            <Badge
              key={caution}
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300"
            >
              {caution}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectSidebar({
  projects,
  selectedSlug,
  query,
  setQuery,
  searchRef,
}: {
  projects: ProjectSummary[];
  selectedSlug: string | null;
  query: string;
  setQuery: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      [
        project.name,
        project.description,
        project.maturity,
        ...project.featureAreas.map((feature) => feature.label),
        ...project.stack.languages,
        ...project.stack.frameworks,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [projects, query]);

  return (
    <aside className="border-b bg-background md:sticky md:top-0 md:h-screen md:w-80 md:shrink-0 md:border-b-0 md:border-r">
      <div className="border-b p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border">
            <FolderKanban className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">My Projects</h1>
            <p className="text-sm text-muted-foreground">{projects.length} fleet projects</p>
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search projects..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <ScrollArea className="h-[42vh] md:h-[calc(100vh-137px)]">
        <nav className="flex gap-2 overflow-x-auto p-3 md:block md:space-y-1 md:overflow-x-visible">
          {filteredProjects.map((project) => {
            const selected = selectedSlug === project.slug;
            return (
              <Button
                key={project.slug}
                asChild
                variant={selected ? 'secondary' : 'ghost'}
                className="h-auto min-w-64 shrink-0 justify-start rounded-md px-3 py-2 text-left md:min-w-0 md:w-full"
              >
                <Link
                  href={`/projects/${project.slug}`}
                  aria-current={selected ? 'page' : undefined}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{project.name}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {maturityLabel(project.maturity)}
                      </Badge>
                    </span>
                    <span className="mt-1 line-clamp-1 text-xs font-normal text-muted-foreground">
                      {project.featureAreas
                        .slice(0, 2)
                        .map((feature) => feature.label)
                        .join(' / ')}
                    </span>
                  </span>
                </Link>
              </Button>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}

export function ProjectsWorkspace({ selectedSlug }: ProjectsWorkspaceProps) {
  const { status } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { data, error, isLoading } = useSWR<ProjectsResponse>('/api/projects', fetcher, {
    revalidateOnFocus: false,
  });
  const projects = data?.projects ?? emptyProjects;
  const selectedProject = useMemo(() => {
    if (projects.length === 0) return null;
    return projects.find((project) => project.slug === selectedSlug) ?? projects[0];
  }, [projects, selectedSlug]);
  const activeSlug = selectedProject?.slug ?? selectedSlug ?? null;
  const {
    data: recommendations,
    error: recommendationsError,
    isLoading: recommendationsLoading,
  } = useSWR<FleetProjectRecommendationReport>(
    activeSlug ? `/api/projects/${activeSlug}/recommendations?limit=30` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [router, status]);

  useEffect(() => {
    if (selectedProject && selectedSlug !== selectedProject.slug) {
      router.replace(`/projects/${selectedProject.slug}`);
    }
  }, [router, selectedProject, selectedSlug]);

  useEffect(() => {
    const isTextEntry = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || element.isContentEditable;
    };
    const navigateProject = (offset: number) => {
      if (!activeSlug || projects.length === 0) return;
      const index = projects.findIndex((project) => project.slug === activeSlug);
      if (index < 0) return;
      const nextProject = projects[(index + offset + projects.length) % projects.length];
      router.push(`/projects/${nextProject.slug}`);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '/' && !isTextEntry(event.target)) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isTextEntry(event.target)) {
        if (event.key === 'Escape') {
          (event.target as HTMLElement).blur();
        }
        return;
      }
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        navigateProject(1);
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        navigateProject(-1);
      } else if (event.key === 'l') {
        router.push('/stars');
      } else if (event.key === 's') {
        router.push('/stack-builder');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSlug, projects, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'unauthenticated') return null;

  const exportMarkdown = () => {
    if (!recommendations?.markdown) return;
    const blob = new Blob([recommendations.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `starboard-${recommendations.project.slug}-recommendations.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const topRecommendations =
    recommendations?.recommendations
      .slice()
      .sort((a, b) => {
        const actionSort = recommendationSortValue(a) - recommendationSortValue(b);
        if (actionSort !== 0) return actionSort;
        return b.score - a.score;
      })
      .slice(0, 6) ?? [];

  return (
    <main className="min-h-screen bg-background md:flex">
      <ProjectSidebar
        projects={projects}
        selectedSlug={activeSlug}
        query={query}
        setQuery={setQuery}
        searchRef={searchRef}
      />

      <section className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b bg-background/80 px-4 py-3 backdrop-blur-sm md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                {selectedProject && (
                  <Badge variant="secondary">{maturityLabel(selectedProject.maturity)}</Badge>
                )}
              </div>
              <h2 className="mt-2 truncate text-lg font-semibold">
                {selectedProject?.name ?? 'My Projects'}
              </h2>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {selectedProject?.description ??
                  'Fleet projects matched against your Starboard repository library.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeSlug && (
                <ShareReportButton
                  type="project-recommendations"
                  projectSlug={activeSlug}
                  label="Share report"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={exportMarkdown}
                disabled={!recommendations?.markdown}
              >
                <ArrowDownToLine className="mr-1.5 size-4" />
                Markdown
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/stack-builder">
                  <Boxes className="mr-1.5 size-4" />
                  Stack
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/stars">
                  <BookOpen className="mr-1.5 size-4" />
                  Library
                </Link>
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <div className="m-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 md:m-6">
            Projects could not load.
          </div>
        )}

        {recommendationsError && (
          <div className="m-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 md:m-6">
            Recommendations could not load.
          </div>
        )}

        {recommendationsLoading && (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {recommendations && (
          <>
            <section className="grid gap-3 p-4 md:grid-cols-5 md:p-6">
              <Card className="rounded-lg py-4 shadow-none md:col-span-2">
                <CardContent className="space-y-3 px-4">
                  <div className="flex flex-wrap gap-1.5">
                    {recommendations.project.stack.frameworks.slice(0, 5).map((framework) => (
                      <Badge key={framework} variant="secondary" className="text-xs">
                        {framework}
                      </Badge>
                    ))}
                    {recommendations.project.stack.languages.slice(0, 4).map((language) => (
                      <Badge key={language} variant="outline" className="text-xs">
                        {language}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {recommendations.project.statusSummary || recommendations.project.readmeSummary}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-lg py-4 shadow-none">
                <CardContent className="px-4">
                  <div className="text-2xl font-semibold">{recommendations.summary.returned}</div>
                  <div className="text-sm text-muted-foreground">repos returned</div>
                </CardContent>
              </Card>
              <Card className="rounded-lg py-4 shadow-none">
                <CardContent className="px-4">
                  <div className="text-2xl font-semibold">{recommendations.summary.useNow}</div>
                  <div className="text-sm text-muted-foreground">use now</div>
                </CardContent>
              </Card>
              <Card className="rounded-lg py-4 shadow-none">
                <CardContent className="px-4">
                  <div className="text-2xl font-semibold">
                    {recommendations.suppressed.dependencyMatches}
                  </div>
                  <div className="text-sm text-muted-foreground">already in use</div>
                </CardContent>
              </Card>
            </section>

            {topRecommendations.length > 0 && (
              <section className="space-y-3 px-4 pb-6 md:px-6">
                <h3 className="text-base font-semibold">Top picks</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {topRecommendations.map((recommendation) => (
                    <RecommendationCard key={recommendation.id} recommendation={recommendation} />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-6 px-4 pb-8 md:px-6">
              {recommendations.byFeatureArea
                .filter((group) => group.recommendations.length > 0)
                .map((group) => (
                  <div key={group.featureArea.id} className="space-y-3">
                    <div>
                      <h3 className="text-base font-semibold">{group.featureArea.label}</h3>
                      <p className="text-sm text-muted-foreground">
                        {group.featureArea.description}
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {group.recommendations.map((recommendation) => (
                        <RecommendationCard
                          key={recommendation.id}
                          recommendation={recommendation}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
