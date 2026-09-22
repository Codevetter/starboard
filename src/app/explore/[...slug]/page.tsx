import type { Metadata } from 'next';

import ExploreClient from './explore-client';

type Props = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!slug || slug.length !== 2) {
    return { title: 'Explore — Starboard' };
  }
  const repoSlug = `${slug[0]}/${slug[1]}`;
  const description = `Repository intelligence for ${repoSlug}: star history, activity, and related GitHub projects.`;
  return {
    title: `${repoSlug} — Starboard`,
    description,
    alternates: { canonical: `/explore/${repoSlug}` },
    openGraph: { title: `${repoSlug} — Starboard`, description },
  };
}

export default function Page() {
  return <ExploreClient />;
}
