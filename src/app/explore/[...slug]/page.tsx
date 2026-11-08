import { notFound, permanentRedirect } from 'next/navigation';

import { getPublicRepo, repositorySlug } from '@/lib/public-repo';
import { getPublicRepoTools } from '@/lib/public-repo-tools';
import {
  hasPublishedRepositoryIdentity,
  publicRepositoryPath,
} from '@/lib/public-repository-catalog';

import RepositoryDetail from './repository-detail';

export const dynamic = 'force-dynamic';

export default async function RepositoryPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const repoSlug = repositorySlug(slug);
  if (!repoSlug) notFound();
  const repo = await getPublicRepo(repoSlug);
  if (!repo) notFound();
  const canonical = publicRepositoryPath(repo.full_name);
  if (!canonical) notFound();
  if (repoSlug !== repo.full_name) permanentRedirect(canonical);
  const initialRepoTools = hasPublishedRepositoryIdentity(repo.id, repo.full_name)
    ? await getPublicRepoTools(repo.id)
    : undefined;
  return (
    <RepositoryDetail
      repoSlug={repo.full_name}
      initialRepo={repo}
      initialRepoTools={initialRepoTools}
    />
  );
}
