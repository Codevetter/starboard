import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/top-bar';
import {
  getPublicRepositorySlice,
  publicRepositoryPath,
  PUBLIC_REPOSITORY_CAPTURED_AT,
  PUBLIC_REPOSITORY_COUNT,
  REPOSITORY_PAGE_COUNT,
  REPOSITORY_PAGE_SIZE,
  repositoryCatalogPage,
  repositoryCatalogPath,
} from '@/lib/public-repository-catalog';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function pageFromParams(params: Record<string, string | string[] | undefined>) {
  return repositoryCatalogPage(
    typeof params.page === 'string' ? params.page : params.page === undefined ? undefined : ''
  );
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageFromParams(await searchParams);
  if (!page) return { title: 'Repository catalog not found', robots: { index: false } };
  return {
    title: `Public repository catalog${page > 1 ? ` — page ${page}` : ''}`,
    description:
      'Browse popular GitHub repositories with descriptions, languages, topics and source evidence. Follow a repository to inspect its detected tools.',
    alternates: { canonical: repositoryCatalogPath(page) },
  };
}

function CatalogPagination({ page }: { page: number }) {
  const nearbyPages = Array.from(
    { length: Math.min(7, REPOSITORY_PAGE_COUNT) },
    (_, index) => Math.max(1, Math.min(page - 3, REPOSITORY_PAGE_COUNT - 6)) + index
  );
  return (
    <nav
      aria-label="Repository catalog pages"
      className="flex flex-wrap items-center gap-2 border-t pt-5 text-sm"
    >
      {page > 1 && (
        <Link
          rel="prev"
          href={repositoryCatalogPath(page - 1)}
          className="inline-flex min-h-11 items-center rounded-md border px-3"
        >
          ← Previous
        </Link>
      )}
      {nearbyPages.map((number) => (
        <Link
          key={number}
          href={repositoryCatalogPath(number)}
          aria-current={number === page ? 'page' : undefined}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 ${number === page ? 'bg-accent font-semibold' : ''}`}
        >
          {number}
        </Link>
      ))}
      {page < REPOSITORY_PAGE_COUNT && (
        <Link
          rel="next"
          href={repositoryCatalogPath(page + 1)}
          className="inline-flex min-h-11 items-center rounded-md border px-3"
        >
          Next →
        </Link>
      )}
      <span className="text-muted-foreground">
        Page {page} of {REPOSITORY_PAGE_COUNT}
      </span>
    </nav>
  );
}

export default async function RepositoryCatalog({ searchParams }: Props) {
  const page = pageFromParams(await searchParams);
  if (!page) notFound();
  const repos = await getPublicRepositorySlice(
    (page - 1) * REPOSITORY_PAGE_SIZE,
    REPOSITORY_PAGE_SIZE
  );
  return (
    <>
      <TopBar
        title="Repository catalog"
        description="Browse public GitHub projects and their source evidence."
      />
      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Popular repositories, A–Z</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Browse a snapshot of {PUBLIC_REPOSITORY_COUNT.toLocaleString('en-US')} popular public
              catalog identities, selected on{' '}
              {new Date(PUBLIC_REPOSITORY_CAPTURED_AT).toLocaleDateString('en-US', {
                timeZone: 'UTC',
                dateStyle: 'long',
              })}
              . Each entry has at least 5,000 recorded GitHub stars and a repository description.
              Metadata is a catalog snapshot; check GitHub for current activity and documentation.
            </p>
            <Link
              href="/discover"
              className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
            >
              Search and filter in Discover →
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo) => (
              <li key={repo.id} className="min-w-0 rounded-xl border bg-card p-4">
                <h2 className="break-words font-medium">
                  <Link
                    href={publicRepositoryPath(repo.full_name)!}
                    prefetch={false}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {repo.full_name}
                  </Link>
                </h2>
                <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">
                  {repo.description}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {repo.stargazers_count.toLocaleString('en-US')} stars
                  {repo.language ? ` · ${repo.language}` : ''}
                  {repo.archived ? ' · Archived' : ''}
                </p>
              </li>
            ))}
          </ul>
          {repos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No entries on this snapshot page currently meet catalog eligibility.
            </p>
          )}
          <CatalogPagination page={page} />
        </div>
      </main>
    </>
  );
}
