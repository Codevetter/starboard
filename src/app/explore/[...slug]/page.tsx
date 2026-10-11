import { notFound } from 'next/navigation';

import { getPublicRepo, repositorySlug } from '@/lib/public-repo';

import RepositoryDetail from './repository-detail';

export const dynamic = 'force-dynamic';

export default async function RepositoryPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const repoSlug = repositorySlug(slug);
  if (!repoSlug) notFound();
  const repo = await getPublicRepo(repoSlug);
  if (!repo) notFound();
  return <RepositoryDetail repoSlug={repoSlug} initialRepo={repo} />;
}
