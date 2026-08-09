import { redirect } from 'next/navigation';

import { ProjectsWorkspace } from '@/components/projects-workspace';
import { auth } from '@/lib/auth';

export default async function ProjectRecommendationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.githubId) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/projects/${slug}`)}`);
  }
  return <ProjectsWorkspace selectedSlug={slug} />;
}
