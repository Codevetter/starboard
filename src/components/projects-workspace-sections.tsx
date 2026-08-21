'use client';

import { ArrowUpRight, FolderGit2, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  GroundedToolRecommendationCard,
  ProjectRecommendationCard,
} from '@/components/project-recommendation-cards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ConnectedProject } from '@/lib/connected-projects';
import type { ProjectIntelligenceResult } from '@/lib/project-intelligence';

import { ConnectProjectForm } from './projects-workspace';
import { retrievalLabel } from './projects-workspace-helpers';

interface RecommendationsResponse extends ProjectIntelligenceResult {
  project: ConnectedProject;
}

interface ProjectsSidebarProps {
  projects: ConnectedProject[];
  error: unknown;
  selectedProject: ConnectedProject | null;
  initialRepository: string;
  onConnected: (project: ConnectedProject) => void;
}

export function ProjectsSidebar(props: ProjectsSidebarProps) {
  const { projects, error, selectedProject, initialRepository, onConnected } = props;
  return (
    <aside className="space-y-5">
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
    </aside>
  );
}

export function EmptyProjectState({ initialRepository }: { initialRepository: string }) {
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

interface ProjectHeaderProps {
  project: ConnectedProject;
  disconnectId: number | null;
  disconnecting: boolean;
  onDisconnect: (project: ConnectedProject) => void;
}

export function ProjectHeader({
  project,
  disconnectId,
  disconnecting,
  onDisconnect,
}: ProjectHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="break-words text-xl font-semibold">{project.fullName}</h2>
          {project.language && <Badge variant="secondary">{project.language}</Badge>}
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {project.description ?? 'No repository description is available.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.topics.slice(0, 6).map((topic) => (
            <Badge key={topic} variant="outline">
              {topic}
            </Badge>
          ))}
          {project.tools.slice(0, 5).map((tool) => (
            <Badge key={tool.key} variant="outline">
              {tool.name}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={project.htmlUrl} target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
        <Button
          variant={disconnectId === project.id ? 'destructive' : 'outline'}
          size="sm"
          disabled={disconnecting}
          onClick={() => onDisconnect(project)}
        >
          {disconnecting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          {disconnectId === project.id ? 'Confirm' : 'Disconnect'}
        </Button>
      </div>
    </div>
  );
}

interface SimilarProjectsSectionProps {
  recommendations: RecommendationsResponse | undefined;
  recommendationError: unknown;
  recommendationsLoading: boolean;
  showAllPeers: boolean;
  onToggleShowAll: () => void;
}

function SimilarProjectsHeader({
  recommendations,
}: {
  recommendations: RecommendationsResponse | undefined;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">Similar projects</h3>
          {recommendations && (
            <Badge variant="outline">{retrievalLabel(recommendations.retrieval.mode)}</Badge>
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
  );
}

interface SimilarProjectsBodyProps {
  recommendations: RecommendationsResponse | undefined;
  recommendationError: unknown;
  recommendationsLoading: boolean;
  showAllPeers: boolean;
  onToggleShowAll: () => void;
}

function SimilarProjectsBody(props: SimilarProjectsBodyProps) {
  const {
    recommendations,
    recommendationError,
    recommendationsLoading,
    showAllPeers,
    onToggleShowAll,
  } = props;
  if (recommendations?.fallback) {
    return (
      <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
        This project has limited context, so these are broad catalog picks. No tool is presented as
        a grounded recommendation in this state.
      </p>
    );
  }
  if (recommendationError) {
    return (
      <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        Recommendations could not load. Try again shortly.
      </p>
    );
  }
  if (recommendationsLoading && !recommendations) {
    return (
      <div className="flex min-h-56 items-center justify-center" aria-busy="true">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only" role="status">
          Loading project recommendations
        </span>
      </div>
    );
  }
  if (recommendations && recommendations.similarProjects.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No eligible catalog matches yet. Browse Discover while the public corpus grows.
      </div>
    );
  }
  if (!recommendations || recommendations.similarProjects.length === 0) return null;

  const peers = showAllPeers
    ? recommendations.similarProjects
    : recommendations.similarProjects.slice(0, 3);

  return (
    <>
      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {peers.map((recommendation, index) => (
          <ProjectRecommendationCard
            key={recommendation.id}
            recommendation={recommendation}
            rank={index + 1}
            retrievalMode={recommendations.retrieval.mode}
          />
        ))}
      </div>
      {recommendations.similarProjects.length > 3 && (
        <Button type="button" variant="outline" className="mt-4" onClick={onToggleShowAll}>
          {showAllPeers
            ? 'Show the strongest matches only'
            : `Show ${recommendations.similarProjects.length - 3} more matches`}
        </Button>
      )}
    </>
  );
}

export function SimilarProjectsSection(props: SimilarProjectsSectionProps) {
  const {
    recommendations,
    recommendationError,
    recommendationsLoading,
    showAllPeers,
    onToggleShowAll,
  } = props;
  return (
    <section>
      <SimilarProjectsHeader recommendations={recommendations} />
      <SimilarProjectsBody
        recommendations={recommendations}
        recommendationError={recommendationError}
        recommendationsLoading={recommendationsLoading}
        showAllPeers={showAllPeers}
        onToggleShowAll={onToggleShowAll}
      />
    </section>
  );
}

export function ToolsToEvaluateSection({
  recommendations,
}: {
  recommendations: RecommendationsResponse;
}) {
  return (
    <section>
      <div>
        <h3 className="text-base font-semibold">Tools to evaluate</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Free recommendations derived only from detected tools in the grounded peers above, with
          support and source confidence visible.
        </p>
      </div>
      {recommendations.recommendedTools.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No additional tools are grounded strongly enough yet.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
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
  );
}

export function DisconnectError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      role="alert"
    >
      {error}
    </p>
  );
}

export function useDisconnectState() {
  const [disconnectId, setDisconnectId] = useState<number | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  return {
    disconnectId,
    setDisconnectId,
    disconnecting,
    setDisconnecting,
    disconnectError,
    setDisconnectError,
  };
}
