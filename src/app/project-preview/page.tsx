import { ProjectPreviewWorkspace } from '@/components/project-preview-workspace';

export default async function ProjectPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string | string[] }>;
}) {
  const params = await searchParams;
  const repository = Array.isArray(params.repository) ? params.repository[0] : params.repository;
  return <ProjectPreviewWorkspace initialRepository={repository ?? ''} />;
}
