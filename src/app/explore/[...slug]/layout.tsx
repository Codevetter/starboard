import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { getPublicRepo, repositorySlug } from '@/lib/public-repo';
import { publicRepositoryPath } from '@/lib/public-repository-admission';

type ExploreParams = { slug: string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<ExploreParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Match the owner/repository path used by the public detail lookup. Avoid
  // giving malformed catch-all paths an indexable repository identity.
  const repoSlug = repositorySlug(slug);
  if (!repoSlug) {
    return { title: 'Invalid repository path', robots: { index: false } };
  }
  const repo = await getPublicRepo(repoSlug);
  if (!repo) return { title: 'Repository not found', robots: { index: false } };
  const fullName = repo.full_name;
  const canonical = publicRepositoryPath(fullName);
  if (!canonical) return { title: 'Invalid repository identity', robots: { index: false } };
  const summary = repo.description?.replace(/\s+/g, ' ').trim();
  const title = summary
    ? `${fullName} — ${summary.length > 120 ? `${summary.slice(0, 119).trimEnd()}…` : summary}`
    : `${fullName} — repository details and tools`;
  const description = repo.description
    ? `${fullName}: ${repo.description}`.slice(0, 300)
    : `Explore ${fullName} on Starboard: inspect repository details, related projects and detected tools, or open the source on GitHub.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} — Starboard`,
      description,
      url: canonical,
      siteName: 'Starboard',
      type: 'website',
    },
    twitter: { card: 'summary', title: `${title} — Starboard`, description },
  };
}

export default async function RepositoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<ExploreParams>;
}) {
  const { slug } = await params;
  const repoSlug = repositorySlug(slug);
  if (!repoSlug || !(await getPublicRepo(repoSlug))) notFound();
  return children;
}
