'use client';

import { ArrowUpRight, Library, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type CatalogUpdatesPayload,
  formatCatalogDate,
  groupCatalogChangesByDate,
} from '@/lib/catalog-updates';
import { getAvatarImageAttrs } from '@/lib/avatar';

const fetcher = async (url: string): Promise<CatalogUpdatesPayload> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

function formatStars(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n);
}

export default function CatalogUpdatesPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<CatalogUpdatesPayload>(
    '/api/catalog-updates?limit=200',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const groups = data ? groupCatalogChangesByDate(data.changes) : [];

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-12 sm:px-6 sm:py-16">
        <div>
          <Link
            href="/"
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Starboard
          </Link>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Catalogue
              </p>
              <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-tight sm:text-4xl">
                <Library className="size-8 text-muted-foreground" aria-hidden />
                Catalog updates
              </h1>
              <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
                Recently added popular repositories in the shared Discover corpus — not the product
                release log. Product history lives on{' '}
                <Link
                  href="/changelog"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Changelog
                </Link>
                .
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void mutate()}
              disabled={isValidating}
            >
              {isValidating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {data?.summary && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card/60 px-4 py-3">
              <p className="text-2xl font-semibold tabular-nums">
                {formatStars(data.summary.totalCatalogRepos)}
              </p>
              <p className="text-xs text-muted-foreground">
                repos ≥ {formatStars(data.summary.minStarsFloor)} stars
              </p>
            </div>
            <div className="rounded-xl border bg-card/60 px-4 py-3">
              <p className="text-sm font-medium">
                {data.summary.newestCatalogedAt
                  ? formatCatalogDate(data.summary.newestCatalogedAt.slice(0, 10))
                  : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Newest catalogue entry</p>
            </div>
            <div className="rounded-xl border bg-card/60 px-4 py-3">
              <p className="text-sm font-medium">{data.summary.changesReturned} shown</p>
              <p className="text-xs text-muted-foreground">Latest ingest slice</p>
            </div>
          </div>
        )}

        {data?.summary?.refreshCadence && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {data.summary.refreshCadence}
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border bg-card/40 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading catalogue history…
          </div>
        ) : error ? (
          <div className="space-y-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4">
            <p className="text-sm text-red-200/90">Couldn&apos;t load catalogue updates.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
              Retry
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No catalogue entries yet. Run a seed-popular job to ingest popular repos.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(({ date, entries }) => (
              <section
                key={date}
                className="rounded-xl border bg-card/50 p-4"
                aria-labelledby={`catalog-day-${date}`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id={`catalog-day-${date}`} className="text-sm font-semibold">
                    {formatCatalogDate(date)}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {entries.length} repo{entries.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {entries.map((entry) => {
                    const avatar = entry.ownerAvatar
                      ? getAvatarImageAttrs(entry.ownerAvatar, 32)
                      : null;
                    return (
                      <li
                        key={entry.id}
                        className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-muted/40"
                      >
                        <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                          Added
                        </span>
                        {entry.language && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {entry.language}
                          </Badge>
                        )}
                        {avatar && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatar.src}
                            srcSet={avatar.srcSet}
                            alt=""
                            width={16}
                            height={16}
                            className="size-4 shrink-0 rounded-full"
                          />
                        )}
                        <Link
                          href={`/explore/${entry.fullName}`}
                          className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline"
                        >
                          {entry.fullName}
                        </Link>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          ★ {formatStars(entry.stargazersCount)}
                        </span>
                        <Link
                          href={entry.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Open ${entry.fullName} on GitHub`}
                        >
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <nav className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-sm" aria-label="Related">
          <Link
            href="/discover"
            className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Public discover →
          </Link>
          <Link
            href="/changelog"
            className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Product changelog →
          </Link>
          <a
            href="/catalog-updates.md"
            className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Machine-readable .md ↗
          </a>
        </nav>
      </main>
    </div>
  );
}
