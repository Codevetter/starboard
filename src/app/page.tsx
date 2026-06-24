import { Bookmark, GitCompare, Search } from 'lucide-react';
import Link from 'next/link';

import { LandingSessionRedirect } from '@/components/landing-session-redirect';
import { SaaSMakerChangelog, SaaSMakerTestimonials } from '@/components/saasmaker-feedback';
import { SampleStaleCleanup } from '@/components/sample-stale-cleanup';
import { SampleStarsBoard } from '@/components/sample-stars-board';
import { SampleWeeklyDigest } from '@/components/sample-weekly-digest';
import { SignInButton } from '@/components/sign-in-button';
import { WeeklyActionPreview } from '@/components/weekly-action-preview';

export const dynamic = 'force-static';

export default function Home() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center overflow-x-hidden bg-background dark:bg-[oklch(0.1_0_0)]">
      <LandingSessionRedirect />
      <main className="flex w-full max-w-6xl flex-col items-center gap-16 overflow-x-hidden px-5 py-12 sm:px-6 sm:py-20">
        {/* Hero */}
        <section className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="flex min-w-0 flex-col items-start gap-6 text-left">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              Ranked by what matters this week
            </span>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Know which of your GitHub stars matter right now.
            </h1>
            <p className="max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              GitHub shows you a flat list. Starboard ranks your stars by recent releases, active
              development, and what you haven&apos;t revisited — so you act on what matters, not
              scroll through noise.
            </p>

            <ul className="grid w-full gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <HeroPoint icon={<span className="text-base leading-none">🟢</span>}>
                See new releases from repos you starred
              </HeroPoint>
              <HeroPoint icon={<GitCompare className="size-4" />}>
                Compare repos side-by-side
              </HeroPoint>
              <HeroPoint icon={<Search className="size-4" />}>
                Semantic search across all your stars
              </HeroPoint>
              <HeroPoint icon={<Bookmark className="size-4" />}>
                Organize into tagged collections
              </HeroPoint>
            </ul>

            <div className="flex w-full flex-col items-start gap-4 pt-2">
              <SignInButton />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link
                  href="/discover"
                  className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  or browse public repos →
                </Link>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Read-only · we only read your public profile and starred repos · no write scopes ·
              revoke anytime in GitHub settings
            </p>
          </div>

          <div className="relative min-w-0">
            <div className="absolute -inset-x-4 -top-6 -bottom-6 -z-10 rounded-3xl bg-gradient-to-br from-primary/15 via-transparent to-transparent blur-2xl" />
            <SampleStarsBoard />
            <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border bg-card/60 px-5 py-4 text-center shadow-sm backdrop-blur">
              <p className="text-sm text-muted-foreground">
                Connect GitHub to see your stars ranked like this
              </p>
              <SignInButton />
              <p className="text-xs text-muted-foreground">
                Read-only · no write scopes · revoke anytime in GitHub settings
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <div className="w-full max-w-3xl">
          <h2 className="mb-6 text-center text-2xl font-bold">How it works</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            <HowItWorksStep
              step={1}
              title="Connect GitHub"
              description="Sign in with GitHub — read-only access to your starred repositories."
            />
            <HowItWorksStep
              step={2}
              title="Sync your stars"
              description="Starboard imports your stars and your GitHub star lists into one library."
            />
            <HowItWorksStep
              step={3}
              title="Search & organize"
              description="Filter by language, run semantic search, and group repos into collections."
            />
          </ol>
        </div>

        {/* Stale cleanup proof */}
        <div className="w-full max-w-3xl">
          <h2 className="mb-2 text-center text-2xl font-bold">Turn noise into decisions</h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Starboard identifies stars you haven&apos;t touched in months, checks if the repo is
            still alive, and gives you a one-line verdict — keep or remove — so cleanup takes
            minutes instead of hours.
          </p>
          <SampleStaleCleanup />
        </div>

        {/* Weekly digest preview */}
        <div className="w-full max-w-4xl">
          <h2 className="mb-2 text-center text-2xl font-bold">
            Never miss what matters in your stars
          </h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Starboard watches every repo you&apos;ve starred and delivers a ranked weekly digest —
            releases, momentum shifts, and dormant gems that just came back to life.
          </p>
          <SampleWeeklyDigest />
        </div>

        {/* Weekly action preview */}
        <div className="w-full max-w-4xl">
          <h2 className="mb-2 text-center text-2xl font-bold">Get actionable insights</h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Upgrade to our Pro plan and receive a weekly action digest with key updates and trends
            from repositories you care about.
          </p>
          <WeeklyActionPreview />
        </div>

        {/* Testimonials */}
        <div className="w-full max-w-3xl">
          <h2 className="mb-6 text-center text-2xl font-bold">What people are saying</h2>
          <SaaSMakerTestimonials />
        </div>

        {/* Changelog */}
        <div className="w-full max-w-2xl">
          <h2 className="mb-6 text-center text-2xl font-bold">Changelog</h2>
          <SaaSMakerChangelog />
        </div>
      </main>
    </div>
  );
}

function HeroPoint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border bg-card/60 px-3 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="text-foreground/90">{children}</span>
    </li>
  );
}

function HowItWorksStep({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <li className="rounded-xl border bg-card p-6 text-card-foreground">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {step}
      </span>
      <h3 className="mb-2 mt-3 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </li>
  );
}
