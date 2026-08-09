import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignInButton } from '@/components/sign-in-button';
import { auth } from '@/lib/auth';

/**
 * Authenticated users go to the product. Anonymous production `/` is the Astro
 * landing overlay (build:cf). This page is the Next.js fallback for local dev.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user?.githubId) {
    redirect('/discover');
  }

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center overflow-x-hidden bg-[oklch(0.12_0.01_260)] text-[oklch(0.97_0.005_90)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 75% 42% at 52% -12%, oklch(0.72 0.07 82 / 0.12), transparent 62%),
            linear-gradient(180deg, oklch(0.18 0.008 70 / 0.45), transparent 28%)
          `,
        }}
      />
      <main className="relative flex w-full max-w-2xl flex-col items-start gap-8 px-5 py-16 sm:px-6 sm:py-24">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span
            className="inline-flex size-9 items-center justify-center rounded-xl text-base font-bold"
            style={{
              background: 'linear-gradient(145deg, oklch(0.94 0.025 90), oklch(0.78 0.05 72))',
              color: 'oklch(0.16 0.02 260)',
            }}
          >
            ★
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold">Starboard</span>
            <span className="mt-1 text-[10px] font-medium tracking-wide text-white/45">
              tool intelligence
            </span>
          </span>
        </Link>

        <div className="flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
            <span className="inline-block size-1.5 rounded-full bg-amber-300" />
            Free · open source · read-only GitHub
          </span>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
            Discover better tools for the project you&apos;re building.
          </h1>
          <p className="max-w-xl text-pretty text-base text-white/50 sm:text-lg">
            Connect a public GitHub project, find similar repositories, and trace suggested tools
            back to the peers that actually use them.
          </p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <SignInButton label="Continue with GitHub" />
          <Link
            href="/discover"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-6 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.06]"
          >
            Browse public repos
          </Link>
        </div>

        <p className="text-xs text-white/40">
          Prefer the full landing?{' '}
          <Link
            href="/login"
            className="font-medium text-white/75 underline-offset-4 hover:underline"
          >
            Open login
          </Link>
        </p>
      </main>
    </div>
  );
}
