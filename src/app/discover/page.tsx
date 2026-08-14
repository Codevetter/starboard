import { NextRequest } from 'next/server';
import type { Metadata } from 'next';

import { GET as getDiscoverRepos } from '@/app/api/discover/route';
import DiscoverClient from '@/app/discover/discover-client';
import type { DiscoverResponse } from '@/hooks/use-discover-repos';
import { PUBLIC_CANONICALS } from '@/lib/public-canonicals';

export const metadata: Metadata = {
  title: 'Discover open-source projects',
  description: 'Search and compare public GitHub projects and the tools they use.',
  alternates: { canonical: PUBLIC_CANONICALS.discover },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const sortMap: Record<string, string> = {
  relevance: 'relevance',
  'fastest-growing': 'growth',
  'recently-updated': 'updated',
  'name-az': 'name',
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function discoverDataUrl(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  const q = first(searchParams.q);
  const language = first(searchParams.lang);
  const tool = first(searchParams.tool);
  const listId = first(searchParams.list);
  const sort = sortMap[first(searchParams.sort) ?? ''];

  if (q) params.set('q', q);
  if (language) params.set('language', language);
  if (tool) params.set('tool', tool);
  if (listId) params.set('list_id', listId);
  if (sort) params.set('sort', sort);

  const query = params.toString();
  return `/discover/data${query ? `?${query}` : ''}`;
}

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const resolvedSearchParams = await searchParams;
  const initialUrl = discoverDataUrl(resolvedSearchParams);
  const response = await getDiscoverRepos(
    new NextRequest(`https://starboard.codevetter.com${initialUrl}`)
  );
  const initialData = response.ok ? ((await response.json()) as DiscoverResponse) : null;

  return <DiscoverClient initialData={initialData} initialUrl={initialUrl} />;
}
