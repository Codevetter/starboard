import { redirect } from 'next/navigation';

import { ProjectsWorkspace } from '@/components/projects-workspace';
import { auth } from '@/lib/auth';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string | string[] }>;
}) {
  const params = await searchParams;
  const repository = Array.isArray(params.repository) ? params.repository[0] : params.repository;
  const session = await auth();
  if (!session?.user?.githubId) {
    const callback = repository
      ? `/projects?repository=${encodeURIComponent(repository)}`
      : '/projects';
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  }
  return <ProjectsWorkspace initialRepository={repository ?? ''} />;
}
