import { ProjectsWorkspace } from '@/components/projects-workspace';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string | string[] }>;
}) {
  const params = await searchParams;
  const repository = Array.isArray(params.repository) ? params.repository[0] : params.repository;
  return <ProjectsWorkspace initialRepository={repository ?? ''} />;
}
