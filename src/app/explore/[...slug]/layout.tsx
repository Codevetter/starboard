import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type ExploreParams = { slug: string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<ExploreParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Match the owner/repository path used by the public detail lookup. Avoid
  // giving malformed catch-all paths an indexable repository identity.
  if (
    slug.length !== 2 ||
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(slug[0]) ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(slug[1]) ||
    slug[1] === '.' ||
    slug[1] === '..'
  ) {
    return { title: 'Invalid repository path', robots: { index: false } };
  }
  const fullName = slug.join('/');
  const canonical = `/explore/${slug.map(encodeURIComponent).join('/')}`;
  const title = `${fullName} — repository intelligence`;
  const description = `Explore ${fullName} on Starboard: inspect repository details, related projects and detected tools, or open the source on GitHub.`;
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

export default function RepositoryLayout({ children }: { children: ReactNode }) {
  return children;
}
