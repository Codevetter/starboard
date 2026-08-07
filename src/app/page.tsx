import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignInButton } from '@/components/sign-in-button';
import { auth } from '@/lib/auth';

/**
 * Authenticated users go straight to the product. Anonymous `/` is served
 * by the Astro landing overlay in production (see worker.mjs + build:cf).
 * This Next page is the local-dev / non-asset fallback with matching CTAs.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user?.githubId) {
    redirect('/discover');
  }

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center overflow-x-hidden bg-background dark:bg-[oklch(0.1_0_0)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_-10%,oklch(0.45_0.14_250_/_0.28),transparent_55%),radial-gradient(ellipse_60%_40%_at_90%_10%,oklch(0.5_0.12_145_/_0.16),transparent_50%)]"
      />
      <main className="relative flex w-full max-w-3xl flex-col items-start gap-8 px-5 py-16 sm:px-6 sm:py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-md border bg-card text-xs">
            ★
          </span>
          Starboard
        </Link>

        <div className="flex flex-col gap-5">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            Free · open source · read-only GitHub access
          </span>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
            Your GitHub stars, ranked by what matters this week.
          </h1>
          <p className="max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Sync, search, and organize starred repos. Radar and digests surface releases and
            momentum so you act on signal instead of scrolling a flat list.
          </p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <SignInButton label="Continue with GitHub" />
          <Link
            href="/discover"
            className="inline-flex h-12 items-center justify-center rounded-md border bg-card/60 px-6 text-sm font-medium transition-colors hover:bg-muted"
          >
            Browse public repos
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Prefer a dedicated page?{' '}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Open login
          </Link>
        </p>
      </main>
    </div>
  );
}
