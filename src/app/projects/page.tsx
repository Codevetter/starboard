import { ProjectsWorkspace } from '@/components/projects-workspace';
import { listFleetProjectSummaries } from '@/lib/fleet-project-data';

export default function ProjectsPage() {
  return <ProjectsWorkspace initialProjects={listFleetProjectSummaries()} />;
}
