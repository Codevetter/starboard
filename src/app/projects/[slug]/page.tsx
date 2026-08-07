import { ProjectsWorkspace } from '@/components/projects-workspace';
import { listFleetProjectSummaries } from '@/lib/fleet-project-data';

export default async function ProjectRecommendationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProjectsWorkspace selectedSlug={slug} initialProjects={listFleetProjectSummaries()} />;
}
