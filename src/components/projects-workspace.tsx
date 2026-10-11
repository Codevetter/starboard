'use client';

import {
  ArrowUpRight,
  ChevronsUpDown,
  FolderGit2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

import {
  GroundedToolRecommendationCard,
  ProjectRecommendationCard,
} from '@/components/project-recommendation-cards';
import { WorkspaceLayout } from '@/components/workspace-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  trackRecommendationSetViewed,
  type ProjectConnectionSource,
  type RecommendationRetrievalMode,
} from '@/lib/analytics';
import type { ConnectedProject } from '@/lib/connected-projects';
import type { PublicGitHubProject } from '@/lib/github-projects';
import type { ProjectIntelligenceResult } from '@/lib/project-intelligence';
import { ProjectModelComparison } from '@/components/project-model-comparison';
import { jsonFetcher } from '@/lib/swr-fetcher';

interface ProjectsResponse {
  projects: ConnectedProject[];
}

interface RecommendationsResponse extends ProjectIntelligenceResult {
  project: ConnectedProject;
}

interface GitHubProjectsResponse {
  repositories: PublicGitHubProject[];
  orgAccessUrl: string | null;
}

function retrievalLabel(mode: RecommendationRetrievalMode): string {
  if (mode === 'knowledgebase') return 'Knowledgebase match';
  if (mode === 'hybrid') return 'Broad evidence match';
  if (mode === 'semantic') return 'Meaning-based match';
  if (mode === 'lexical-structured') return 'Catalog-context match';
  if (mode === 'structured') return 'Language match';
  return 'Broad catalog fallback';
}

function LoadingScreen() {
  return (
    <main
      className="flex min-h-0 flex-1 items-center justify-center bg-background"
      aria-busy="true"
    >
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </main>
  );
}

function ConnectProjectForm({
  initialRepository,
  onConnected,
}: {
  initialRepository: string;
  onConnected: (project: ConnectedProject) => void;
}) {
  const [repository, setRepository] = useState(initialRepository);
  const [source, setSource] = useState<ProjectConnectionSource>('manual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerRepositories, setPickerRepositories] = useState<PublicGitHubProject[] | null>(null);
  const [orgAccessUrl, setOrgAccessUrl] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [activePickerIndex, setActivePickerIndex] = useState(0);
  const pickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const pickerOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const filteredRepositories = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return pickerRepositories ?? [];
    return (pickerRepositories ?? []).filter(
      (project) =>
        project.fullName.toLowerCase().includes(query) ||
        project.description?.toLowerCase().includes(query) ||
        project.language?.toLowerCase().includes(query)
    );
  }, [pickerQuery, pickerRepositories]);

  function movePickerFocus(offset: number) {
    if (filteredRepositories.length === 0) return;
    const next =
      (activePickerIndex + offset + filteredRepositories.length) % filteredRepositories.length;
    setActivePickerIndex(next);
    pickerOptionRefs.current[next]?.focus();
  }

  function closePicker() {
    setPickerOpen(false);
    queueMicrotask(() => pickerButtonRef.current?.focus());
  }

  async function loadPickerRepositories() {
    if (pickerBusy) return;
    setPickerBusy(true);
    setPickerError(null);
    try {
      const response = await fetch('/api/github/projects');
      const payload = (await response.json()) as GitHubProjectsResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'GitHub repositories could not load.');
      setPickerRepositories(payload.repositories);
      setOrgAccessUrl(payload.orgAccessUrl ?? null);
      setActivePickerIndex(0);
    } catch (reason) {
      setPickerError(
        reason instanceof Error
          ? reason.message
          : 'GitHub repositories could not load. Paste a public URL instead.'
      );
    } finally {
      setPickerBusy(false);
    }
  }

  function togglePicker() {
    const nextOpen = !pickerOpen;
    setPickerOpen(nextOpen);
    if (nextOpen) {
      setPickerQuery('');
      setActivePickerIndex(0);
    }
    if (!nextOpen || pickerRepositories) return;
    void loadPickerRepositories();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository, source }),
      });
      const payload = (await response.json()) as { project?: ConnectedProject; error?: string };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error || 'Project could not be connected.');
      }
      setRepository('');
      setSource('manual');
      onConnected(payload.project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Project could not be connected.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Input
        value={repository}
        onChange={(event) => {
          setRepository(event.target.value);
          setSource('manual');
        }}
        placeholder="github.com/owner/repository"
        aria-label="Public GitHub repository"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={Boolean(initialRepository)}
      />
      <div className="grid gap-2">
        <Button type="submit" disabled={busy || !repository.trim()} className="h-11">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Connect
        </Button>
        <Button
          ref={pickerButtonRef}
          type="button"
          variant="outline"
          className="h-11"
          aria-expanded={pickerOpen}
          aria-controls="github-project-results"
          onClick={togglePicker}
        >
          {pickerBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ChevronsUpDown className="size-4" />
          )}
          Choose from GitHub
        </Button>
      </div>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>Choose a GitHub project</DialogTitle>
            <DialogDescription>
              Select a public repository, then connect it to see recommendations.
            </DialogDescription>
          </DialogHeader>
          {pickerBusy && (
            <p className="p-3 text-sm text-muted-foreground">Loading public repositories…</p>
          )}
          {pickerError && (
            <p className="p-3 text-sm text-destructive" role="alert">
              {pickerError}
            </p>
          )}
          {pickerRepositories && !pickerError && (
            <div className="shrink-0 space-y-2 border-b p-4">
              <Input
                value={pickerQuery}
                onChange={(event) => {
                  setPickerQuery(event.target.value);
                  setActivePickerIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && filteredRepositories.length > 0) {
                    event.preventDefault();
                    pickerOptionRefs.current[0]?.focus();
                  }
                }}
                placeholder="Search public repositories"
                aria-label="Search public GitHub repositories"
                aria-controls="github-project-results"
              />
              <p className="px-1 text-xs text-muted-foreground" aria-live="polite">
                {filteredRepositories.length} of {pickerRepositories.length} public repositories
              </p>
            </div>
          )}
          {pickerRepositories?.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              No public repositories were returned. Paste a URL instead — or if an organization is
              missing, grant Starboard access on GitHub and refresh this list.
            </p>
          )}
          {pickerRepositories &&
            pickerRepositories.length > 0 &&
            filteredRepositories.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                No repositories match that search.
              </p>
            )}
          <div
            id="github-project-results"
            role="listbox"
            className="max-h-[min(50dvh,360px)] min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
            aria-label="Public GitHub repositories"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                movePickerFocus(1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                movePickerFocus(-1);
              } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                const index = event.key === 'Home' ? 0 : filteredRepositories.length - 1;
                setActivePickerIndex(index);
                pickerOptionRefs.current[index]?.focus();
              }
            }}
          >
            {filteredRepositories.map((project, index) => (
              <button
                key={project.id}
                ref={(element) => {
                  pickerOptionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={repository === project.fullName}
                title={project.fullName}
                tabIndex={index === activePickerIndex ? 0 : -1}
                className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onFocus={() => setActivePickerIndex(index)}
                onClick={() => {
                  setRepository(project.fullName);
                  setSource('picker');
                  closePicker();
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">{project.ownerLogin}</span>
                  <span className="block break-words font-medium">{project.name}</span>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                    {project.description ?? 'No description'}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {project.language ?? 'Other'}
                </span>
              </button>
            ))}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-4">
            <p className="text-xs text-muted-foreground">
              Missing a repository?{' '}
              {orgAccessUrl ? (
                <a
                  href={orgAccessUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                >
                  Grant access on GitHub
                </a>
              ) : (
                'Grant access in your GitHub app settings'
              )}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={pickerBusy}
              onClick={() => void loadPickerRepositories()}
            >
              <RefreshCw className={`size-3.5 ${pickerBusy ? 'animate-spin' : ''}`} />
              Refresh list
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <p className="text-xs text-muted-foreground">
        Public repositories only. You can also paste a GitHub URL.
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

interface RecommendationsData {
  recommendations: RecommendationsResponse | undefined;
  recommendationError: Error | undefined;
  recommendationsLoading: boolean;
}

interface RecommendationsUI {
  showAllPeers: boolean;
  setShowAllPeers: React.Dispatch<React.SetStateAction<boolean>>;
}

function RecommendationStatus({
  recommendations,
  recommendationError,
  recommendationsLoading,
}: RecommendationsData) {
  return (
    <>
      {' '}
      {recommendations?.fallback && (
        <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          {recommendations.quality?.status === 'unavailable'
            ? recommendations.quality.reason === 'insufficient-context'
              ? 'There is not enough project context to review matches. Add a README describing the product, or choose a folder with its own README.'
              : 'Relevance review is temporarily unavailable. Try again shortly; unreviewed matches are withheld.'
            : 'No sufficiently relevant matches were found. Shared language or framework alone does not qualify a recommendation.'}
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
          <span className="sr-only" role="status">
            Loading project recommendations
          </span>
        </div>
      )}
      {recommendations &&
        !recommendations.fallback &&
        recommendations.similarProjects.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No reviewed matches are available.
          </div>
        )}
    </>
  );
}

function RecommendationsSection({
  data,
  ui,
}: {
  data: RecommendationsData;
  ui: RecommendationsUI;
}) {
  const { recommendations } = data;
  const { showAllPeers, setShowAllPeers } = ui;
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">Similar projects</h3>
            {recommendations && (
              <Badge variant="outline">
                {recommendations.quality?.status === 'reviewed'
                  ? recommendations.similarProjects.length
                    ? 'Reviewed matches'
                    : 'No relevant matches'
                  : retrievalLabel(recommendations.retrieval.mode)}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The grounding set for recommendations, retrieved from the public catalog and reranked by
            visible evidence.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/discover" prefetch={false}>
            Browse all
          </Link>
        </Button>
      </div>

      <RecommendationStatus {...data} />
      {recommendations && recommendations.similarProjects.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {(showAllPeers
            ? recommendations.similarProjects
            : recommendations.similarProjects.slice(0, 3)
          ).map((recommendation, index) => (
            <ProjectRecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              rank={index + 1}
              retrievalMode={recommendations.retrieval.mode}
            />
          ))}
        </div>
      )}
      {recommendations && recommendations.similarProjects.length > 3 && (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => setShowAllPeers((value) => !value)}
        >
          {showAllPeers
            ? 'Show the strongest matches only'
            : `Show ${recommendations.similarProjects.length - 3} more matches`}
        </Button>
      )}
    </section>
  );
}

interface ProjectDetailPanelProps {
  selectedProject: ConnectedProject;
  recommendations: RecommendationsResponse | undefined;
  recommendationError: Error | undefined;
  recommendationsLoading: boolean;
  showAllPeers: boolean;
  setShowAllPeers: React.Dispatch<React.SetStateAction<boolean>>;
  disconnectId: number | null;
  disconnecting: boolean;
  disconnectError: string | null;
  onDisconnect: (project: ConnectedProject) => void;
  scope: string;
  onScopeChange: (scope: string) => void;
}

function ProjectFolderForm({
  scope,
  onScopeChange,
  loading,
}: {
  scope: string;
  onScopeChange: (scope: string) => void;
  loading: boolean;
}) {
  const [folder, setFolder] = useState(scope);
  return (
    <form
      className="max-w-xl space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onScopeChange(folder.trim());
      }}
    >
      <label htmlFor="project-folder" className="text-sm font-medium">
        Focus on a folder
      </label>
      <div className="flex gap-2">
        <Input
          id="project-folder"
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
          placeholder="Optional, e.g. apps/memory-map"
          maxLength={180}
          autoCapitalize="none"
          spellCheck={false}
        />
        <Button type="submit" variant="outline" disabled={loading}>
          {scope === folder.trim() ? 'Refresh' : 'Apply'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use a subapp’s README and dependencies. Leave blank for the whole repository.
      </p>
    </form>
  );
}

function ProjectDetailHeader({
  selectedProject,
  recommendations,
  disconnectId,
  disconnecting,
  onDisconnect,
}: Pick<
  ProjectDetailPanelProps,
  'selectedProject' | 'recommendations' | 'disconnectId' | 'disconnecting' | 'onDisconnect'
>) {
  const inspectedProject = recommendations?.project ?? selectedProject;
  return (
    <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="break-words text-xl font-semibold">{selectedProject.fullName}</h2>
          {inspectedProject.language && (
            <Badge variant="secondary">{inspectedProject.language}</Badge>
          )}
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {inspectedProject.description ?? 'No repository description is available.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {inspectedProject.topics.slice(0, 6).map((topic) => (
            <Badge key={topic} variant="outline">
              {topic}
            </Badge>
          ))}
          {(recommendations?.context.tools ?? selectedProject.tools).slice(0, 8).map((tool) => (
            <Badge key={tool.key} variant="outline">
              {tool.name}
            </Badge>
          ))}
        </div>
        {recommendations?.context.sourceContext && (
          <p className="mt-3 text-xs text-muted-foreground">
            {recommendations.context.sourceContext.status === 'unavailable'
              ? 'Project files could not be checked. Matches use catalog metadata; tool suggestions are withheld.'
              : `Checked ${recommendations.context.sourceContext.files.length} public product documents and manifest files${recommendations.context.sourceContext.status === 'partial' ? ' (partial coverage)' : ''}.`}
          </p>
        )}
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
          onClick={() => onDisconnect(selectedProject)}
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
  );
}

function ProjectDetailPanel(props: ProjectDetailPanelProps) {
  const {
    selectedProject,
    recommendations,
    recommendationError,
    recommendationsLoading,
    showAllPeers,
    setShowAllPeers,
    disconnectId,
    disconnecting,
    disconnectError,
    onDisconnect,
    scope,
    onScopeChange,
  } = props;
  return (
    <div className="space-y-8">
      <ProjectDetailHeader {...props} />
      <ProjectFolderForm
        key={`${selectedProject.id}:${scope}`}
        scope={scope}
        onScopeChange={onScopeChange}
        loading={recommendationsLoading}
      />
      <RecommendationsSection
        data={{ recommendations, recommendationError, recommendationsLoading }}
        ui={{ showAllPeers, setShowAllPeers }}
      />
      <ProjectModelComparison
        key={`comparison:${selectedProject.id}:${scope}`}
        projectId={selectedProject.id}
        scope={scope}
      />
      {disconnectError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {disconnectError}
        </p>
      )}
      {recommendations && !recommendations.fallback && (
        <section>
          <div>
            <h3 className="text-base font-semibold">Tools to evaluate</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tools used by related projects with a compatible runtime, excluding tools already
              detected here. These are candidates to evaluate, not verified missing capabilities.
            </p>
          </div>
          {recommendations.recommendedTools.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No additional tools are grounded strongly enough yet.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {recommendations.recommendedTools.map((recommendation, index) => (
                <GroundedToolRecommendationCard
                  key={recommendation.key}
                  recommendation={recommendation}
                  rank={index + 1}
                  retrievalMode={recommendations.retrieval.mode}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface ProjectsSidebarData {
  projects: ConnectedProject[];
  error: Error | undefined;
  initialRepository: string;
}

interface ProjectsSidebarSelection {
  selectedProject: ConnectedProject | null;
  onConnected: (project: ConnectedProject) => void;
}

function ProjectsSidebar({
  data,
  selection,
}: {
  data: ProjectsSidebarData;
  selection: ProjectsSidebarSelection;
}) {
  const { projects, error, initialRepository } = data;
  const { selectedProject, onConnected } = selection;
  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-medium">Connect a GitHub project</h2>
        <ConnectProjectForm initialRepository={initialRepository} onConnected={onConnected} />
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
    </div>
  );
}

function EmptyProjectState({ initialRepository }: { initialRepository: string }) {
  return (
    <div className="flex min-h-[28rem] flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border bg-card">
        <FolderGit2 className="size-5" />
      </div>
      <h2 className="mt-5 text-xl font-semibold">
        {initialRepository ? `Connect ${initialRepository}` : 'Start with a project'}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {initialRepository
          ? 'Your preview is ready to become a connected project. Confirm the prefilled repository above; nothing is saved until you select Connect.'
          : 'Choose a public GitHub repository or paste its URL. Starboard compares it with the full eligible catalog and explains the evidence behind each result.'}
      </p>
    </div>
  );
}

interface DisconnectState {
  disconnectId: number | null;
  disconnecting: boolean;
  disconnectError: string | null;
  setDisconnectId: (id: number | null) => void;
  setDisconnecting: (v: boolean) => void;
  setDisconnectError: (e: string | null) => void;
}

interface DisconnectContext {
  projects: ConnectedProject[];
  mutate: (data: ProjectsResponse, opts?: { revalidate?: boolean }) => Promise<unknown>;
  router: ReturnType<typeof useRouter>;
}

async function executeDisconnect(
  project: ConnectedProject,
  state: DisconnectState,
  ctx: DisconnectContext
) {
  if (state.disconnectId !== project.id) {
    state.setDisconnectId(project.id);
    return;
  }
  state.setDisconnecting(true);
  state.setDisconnectError(null);
  try {
    const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Project could not be disconnected.');
    state.setDisconnectId(null);
    await ctx.mutate(
      { projects: ctx.projects.filter((item) => item.id !== project.id) },
      { revalidate: false }
    );
    ctx.router.replace('/projects');
  } catch (reason) {
    state.setDisconnectError(
      reason instanceof Error ? reason.message : 'Project could not be disconnected.'
    );
  } finally {
    state.setDisconnecting(false);
  }
}

function createScopeHandler(
  scope: string,
  project: ConnectedProject | undefined,
  router: ReturnType<typeof useRouter>,
  mutate: () => unknown
) {
  return (path: string) => {
    if (path === scope) {
      void mutate();
      return;
    }
    if (project)
      router.replace(`/projects/${project.id}${path ? `?path=${encodeURIComponent(path)}` : ''}`);
  };
}

function useProjectsWorkspaceState(selectedSlug: string | undefined, initialRepository: string) {
  const { status } = useSession();
  const router = useRouter();
  const scope = useSearchParams().get('path') ?? '';
  const trackedSet = useRef<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR<ProjectsResponse>(
    status === 'authenticated' ? '/api/projects' : null,
    jsonFetcher,
    { revalidateOnFocus: false }
  );
  const projects = data?.projects ?? [];
  const selectedProject = useMemo(
    () =>
      initialRepository && !selectedSlug
        ? null
        : (projects.find((project) => String(project.id) === selectedSlug) ?? projects[0] ?? null),
    [initialRepository, projects, selectedSlug]
  );
  const [disconnectId, setDisconnectId] = useState<number | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [showAllPeers, setShowAllPeers] = useState(false);
  const recommendationUrl = selectedProject
    ? `/api/projects/${selectedProject.id}/recommendations?limit=24${scope ? `&path=${encodeURIComponent(scope)}` : ''}`
    : null;
  const {
    data: recommendations,
    error: recommendationError,
    isLoading: recommendationsLoading,
    mutate: mutateRecommendations,
  } = useSWR<RecommendationsResponse>(recommendationUrl, jsonFetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      const callback = initialRepository
        ? `/projects?repository=${encodeURIComponent(initialRepository)}`
        : '/projects';
      router.replace(`/login?callbackUrl=${encodeURIComponent(callback)}`);
    }
  }, [initialRepository, router, status]);

  useEffect(() => {
    if (selectedProject && !initialRepository && selectedSlug !== String(selectedProject.id)) {
      router.replace(`/projects/${selectedProject.id}`);
    }
  }, [initialRepository, router, selectedProject, selectedSlug]);

  useEffect(() => {
    if (!recommendations || !selectedProject) return;
    const key = `${selectedProject.id}:${recommendations.retrieval.mode}:${recommendations.similarProjects.length}`;
    if (trackedSet.current === key) return;
    trackedSet.current = key;
    trackRecommendationSetViewed(
      recommendations.retrieval.mode,
      recommendations.similarProjects.length,
      recommendations.fallback
    );
  }, [recommendations, selectedProject]);

  useEffect(() => {
    setShowAllPeers(false);
  }, [selectedProject?.id]);

  const { disconnect, connected } = useProjectCallbacks(
    {
      disconnectId,
      disconnecting,
      disconnectError,
      setDisconnectId,
      setDisconnecting,
      setDisconnectError,
    },
    { projects, mutate, router, scope }
  );

  return {
    status,
    projects,
    error,
    isLoading,
    data,
    selectedProject,
    disconnectId,
    disconnecting,
    disconnectError,
    showAllPeers,
    setShowAllPeers,
    recommendations,
    recommendationError,
    recommendationsLoading,
    disconnect,
    connected,
    scope,
    applyScope: createScopeHandler(scope, selectedProject, router, mutateRecommendations),
  };
}

function useProjectCallbacks(
  state: DisconnectState,
  ctx: {
    projects: ConnectedProject[];
    mutate: ReturnType<typeof useSWR<ProjectsResponse>>['mutate'];
    router: ReturnType<typeof useRouter>;
    scope: string;
  }
) {
  const disconnect = (project: ConnectedProject) => executeDisconnect(project, state, ctx);
  const connected = (project: ConnectedProject) => {
    ctx.mutate(
      { projects: [project, ...ctx.projects.filter((i) => i.id !== project.id)] },
      { revalidate: false }
    );
    ctx.router.push(
      `/projects/${project.id}${ctx.scope ? `?path=${encodeURIComponent(ctx.scope)}` : ''}`
    );
  };
  return { disconnect, connected };
}

export function ProjectsWorkspace({
  selectedSlug,
  initialRepository = '',
}: {
  selectedSlug?: string;
  initialRepository?: string;
}) {
  const state = useProjectsWorkspaceState(selectedSlug, initialRepository);
  const {
    status,
    projects,
    error,
    isLoading,
    data,
    selectedProject,
    disconnectId,
    disconnecting,
    disconnectError,
    showAllPeers,
    setShowAllPeers,
    recommendations,
    recommendationError,
    recommendationsLoading,
    disconnect,
    connected,
    scope,
    applyScope,
  } = state;

  if (status === 'loading' || (status === 'authenticated' && isLoading && !data)) {
    return <LoadingScreen />;
  }
  if (status === 'unauthenticated') return <LoadingScreen />;

  return (
    <WorkspaceLayout
      title="Projects"
      description="Discover tools for what you are building."
      sidebarLabel="Your projects"
      sidebar={
        <ProjectsSidebar
          data={{ projects, error, initialRepository }}
          selection={{ selectedProject, onConnected: connected }}
        />
      }
    >
      <section className="min-w-0">
        {!selectedProject ? (
          <EmptyProjectState initialRepository={initialRepository} />
        ) : (
          <ProjectDetailPanel
            selectedProject={selectedProject}
            scope={scope}
            onScopeChange={applyScope}
            recommendations={recommendations}
            recommendationError={recommendationError}
            recommendationsLoading={recommendationsLoading}
            showAllPeers={showAllPeers}
            setShowAllPeers={setShowAllPeers}
            disconnectId={disconnectId}
            disconnecting={disconnecting}
            disconnectError={disconnectError}
            onDisconnect={disconnect}
          />
        )}
      </section>
    </WorkspaceLayout>
  );
}
