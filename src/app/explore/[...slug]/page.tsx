import type { Metadata } from 'next';

import { getRepoFromDb } from '@/app/api/repos/resolve';

import ExploreClient from './explore-client';

type Props = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!slug || slug.length !== 2) {
    return { title: 'Explore — Starboard' };
  }
  const repoSlug = `${slug[0]}/${slug[1]}`;
  let description = `Repository intelligence for ${repoSlug}: star history, activity, and related GitHub projects.`;
  try {
    const repo = await getRepoFromDb(repoSlug);
    if (repo) {
      const stars = new Intl.NumberFormat('en', { notation: 'compact' }).format(
        repo.stargazers_count
      );
      const base = repo.description?.trim() || `${repo.full_name} on GitHub`;
      description = `${base} — ${stars} stars${repo.language ? `, ${repo.language}` : ''}. Star history and related projects on Starboard.`;
    }
  } catch {
    // keep the generic description when the catalog is unreachable
  }
  return {
    title: `${repoSlug} — Starboard`,
    description,
    alternates: { canonical: `/explore/${repoSlug}` },
    openGraph: { title: `${repoSlug} — Starboard`, description },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const repoSlug = slug?.length === 2 ? `${slug[0]}/${slug[1]}` : null;
  let initialRepo = null;
  if (repoSlug) {
    try {
      initialRepo = await getRepoFromDb(repoSlug);
    } catch {
      // D1 unavailable (e.g. local dev without bindings) — the client
      // still resolves the repo through the lookup API.
    }
  }
  return <ExploreClient initialRepo={initialRepo} />;
}
