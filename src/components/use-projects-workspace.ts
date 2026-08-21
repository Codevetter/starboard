'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

import { trackRecommendationSetViewed } from '@/lib/analytics';
import type { ConnectedProject } from '@/lib/connected-projects';
import type { ProjectIntelligenceResult } from '@/lib/project-intelligence';
import { jsonFetcher } from '@/lib/swr-fetcher';

import { useDisconnectState } from './projects-workspace-sections';

interface ProjectsResponse {
  projects: ConnectedProject[];
}

interface RecommendationsResponse extends ProjectIntelligenceResult {
  project: ConnectedProject;
}

interface UseProjectsWorkspaceOptions {
  selectedSlug?: string;
  initialRepository: string;
}

interface ProjectsWorkspaceState {
  status: string;
  projects: ConnectedProject[];
  error: unknown;
  isLoading: boolean;
  data: ProjectsResponse | undefined;
  selectedProject: ConnectedProject | null;
  recommendations: RecommendationsResponse | undefined;
  recommendationError: unknown;
  recommendationsLoading: boolean;
  showAllPeers: boolean;
  setShowAllPeers: React.Dispatch<React.SetStateAction<boolean>>;
  disconnectId: number | null;
  disconnecting: boolean;
  disconnectError: string | null;
  disconnect: (project: ConnectedProject) => Promise<void>;
  connected: (project: ConnectedProject) => void;
}

function useAuthRedirect(status: string, initialRepository: string) {
  const router = useRouter();
  useEffect(() => {
    if (status === 'unauthenticated') {
      const callback = initialRepository
        ? `/projects?repository=${encodeURIComponent(initialRepository)}`
        : '/projects';
      router.replace(`/login?callbackUrl=${encodeURIComponent(callback)}`);
    }
  }, [initialRepository, router, status]);
}

function useUrlSync(
  selectedProject: ConnectedProject | null,
  initialRepository: string,
  selectedSlug: string | undefined
) {
  const router = useRouter();
  useEffect(() => {
    if (selectedProject && !initialRepository && selectedSlug !== String(selectedProject.id)) {
      router.replace(`/projects/${selectedProject.id}`);
    }
  }, [initialRepository, router, selectedProject, selectedSlug]);
}

function useRecommendationTracking(
  recommendations: RecommendationsResponse | undefined,
  selectedProject: ConnectedProject | null
) {
  const trackedSet = useRef<string | null>(null);
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
}

export function useProjectsWorkspace({
  selectedSlug,
  initialRepository,
}: UseProjectsWorkspaceOptions): ProjectsWorkspaceState {
  const { status } = useSession();
  const router = useRouter();
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
  const {
    disconnectId,
    setDisconnectId,
    disconnecting,
    setDisconnecting,
    disconnectError,
    setDisconnectError,
  } = useDisconnectState();
  const [showAllPeers, setShowAllPeers] = useState(false);
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

  useAuthRedirect(status, initialRepository);
  useUrlSync(selectedProject, initialRepository, selectedSlug);
  useRecommendationTracking(recommendations, selectedProject);

  useEffect(() => {
    setShowAllPeers(false);
  }, [selectedProject?.id]);

  async function disconnect(project: ConnectedProject) {
    if (disconnectId !== project.id) {
      setDisconnectId(project.id);
      return;
    }
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Project could not be disconnected.');
      setDisconnectId(null);
      await mutate(
        { projects: projects.filter((item) => item.id !== project.id) },
        { revalidate: false }
      );
      router.replace('/projects');
    } catch (reason) {
      setDisconnectError(
        reason instanceof Error ? reason.message : 'Project could not be disconnected.'
      );
    } finally {
      setDisconnecting(false);
    }
  }

  function connected(project: ConnectedProject) {
    const nextProjects = [project, ...projects.filter((item) => item.id !== project.id)];
    mutate({ projects: nextProjects }, { revalidate: false });
    router.push(`/projects/${project.id}`);
  }

  return {
    status,
    projects,
    error,
    isLoading,
    data,
    selectedProject,
    recommendations,
    recommendationError,
    recommendationsLoading,
    showAllPeers,
    setShowAllPeers,
    disconnectId,
    disconnecting,
    disconnectError,
    disconnect,
    connected,
  };
}
