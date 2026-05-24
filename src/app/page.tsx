import { Bookmark, GitCompare, Search } from "lucide-react";
import Link from "next/link";

import { LandingHeroPreview } from "@/components/landing-hero-preview";
import { LandingSessionRedirect } from "@/components/landing-session-redirect";
import { SaaSMakerChangelog, SaaSMakerTestimonials } from "@/components/saasmaker-feedback";
import { SignInButton } from "@/components/sign-in-button";

export const dynamic = "force-static";

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
              Semantic search across your stars
            </span>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Repo intelligence for the things you star.
            </h1>
            <p className="max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              Starboard imports your GitHub stars, embeds them alongside the
              top open-source projects, and lets you{" "}
              <span className="text-foreground">scan, compare, save, and act</span>{" "}
              — instead of forgetting them in a 2,000-row list.
            </p>

            <ul className="grid w-full gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <HeroPoint icon={<Search className="size-4" />}>
                Ask in plain English, not by keyword
              </HeroPoint>
              <HeroPoint icon={<GitCompare className="size-4" />}>
                Compare repos side-by-side
              </HeroPoint>
              <HeroPoint icon={<Bookmark className="size-4" />}>
                Save into your own collections
              </HeroPoint>
              <HeroPoint icon={<span className="text-base leading-none">★</span>}>
                Track activity on what you starred
              </HeroPoint>
            </ul>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
              <SignInButton />
              <Link
                href="/discover"
                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                or browse discover →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Read-only access · no write scopes · revoke anytime
            </p>
          </div>

          <div className="relative min-w-0">
            <div className="absolute -inset-x-4 -top-6 -bottom-6 -z-10 rounded-3xl bg-gradient-to-br from-primary/15 via-transparent to-transparent blur-2xl" />
            <LandingHeroPreview />
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

function HeroPoint({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
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
