import { Clock3, Star } from 'lucide-react';

type InsightVariant = 'release' | 'active' | 'watch' | 'stale';

type SampleRepo = {
  owner: string;
  name: string;
  description: string;
  language: string;
  languageColor: string;
  stars: string;
  updated: string;
  insight: { variant: InsightVariant; label: string };
  why: string;
};

const SAMPLE_REPOS: SampleRepo[] = [
  {
    owner: 'vercel',
    name: 'next.js',
    description: 'The React Framework — App Router, RSC, and edge-ready deploys.',
    language: 'JavaScript',
    languageColor: '#f1e05a',
    stars: '128k',
    updated: '2d ago',
    insight: { variant: 'release', label: 'v15.3 released' },
    why: 'New release 2 days ago — changelog has breaking App Router changes worth reviewing.',
  },
  {
    owner: 'shadcn-ui',
    name: 'ui',
    description: 'Beautifully designed components built with Radix UI and Tailwind CSS.',
    language: 'TypeScript',
    languageColor: '#3178c6',
    stars: '78k',
    updated: '1d ago',
    insight: { variant: 'active', label: '14 commits this week' },
    why: '14 commits in 7 days — components you use are being actively changed.',
  },
  {
    owner: 'tailwindlabs',
    name: 'tailwindcss',
    description: 'A utility-first CSS framework for rapid UI development.',
    language: 'JavaScript',
    languageColor: '#f1e05a',
    stars: '85k',
    updated: '3d ago',
    insight: { variant: 'release', label: 'v4.1 just dropped' },
    why: 'v4.1 rewrites the CSS engine — migration guide dropped 3 days ago.',
  },
  {
    owner: 'microsoft',
    name: 'TypeScript',
    description: 'TypeScript is a superset of JavaScript that compiles to clean JavaScript output.',
    language: 'TypeScript',
    languageColor: '#3178c6',
    stars: '101k',
    updated: '5d ago',
    insight: { variant: 'watch', label: '5.9 RC — review breaking changes' },
    why: '5.9 RC introduces type narrowing changes — review before your next upgrade.',
  },
  {
    owner: 'denoland',
    name: 'deno',
    description: 'A modern runtime for JavaScript and TypeScript.',
    language: 'Rust',
    languageColor: '#dea584',
    stars: '98k',
    updated: '8mo ago',
    insight: { variant: 'stale', label: 'Starred 8 mo · never opened' },
    why: 'Starred 8 months ago, never opened — worth a quick look or drop from your list.',
  },
];

const insightStyles: Record<InsightVariant, string> = {
  release: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  active: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  watch: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  stale: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
};

export function SampleStarsBoard() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative w-full select-none overflow-hidden rounded-2xl border bg-card/80 shadow-xl shadow-black/5 backdrop-blur dark:bg-card/50 dark:shadow-black/30"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="size-2.5 rounded-full bg-rose-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-2 font-mono">starboard.app/stars</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">My Stars</span>
          <span className="rounded-full border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            1,284
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="rounded border bg-primary/10 px-2 py-0.5 font-medium text-primary">
            By activity ↓
          </span>
          <span className="rounded border px-2 py-0.5 text-muted-foreground">Language</span>
          <span className="rounded border px-2 py-0.5 text-muted-foreground">Tags</span>
        </div>
      </div>

      {/* Repo rows */}
      <ul className="divide-y">
        {SAMPLE_REPOS.map((repo, i) => (
          <li key={`${repo.owner}/${repo.name}`} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-0.5 w-3 shrink-0 font-mono text-[11px] text-muted-foreground/50">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-medium text-foreground">
                  <span className="text-muted-foreground">{repo.owner}/</span>
                  {repo.name}
                </span>
                <span
                  className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${insightStyles[repo.insight.variant]}`}
                >
                  {repo.insight.label}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                {repo.description}
              </p>
              <p className="mt-0.5 line-clamp-1 text-[10px] italic text-muted-foreground/60">
                {repo.why}
              </p>
              <div className="mt-1 flex items-center gap-2.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: repo.languageColor }}
                  />
                  {repo.language}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="size-2.5 fill-current" />
                  {repo.stars}
                </span>
                <span className="flex items-center gap-1">
                  <Clock3 className="size-2.5" />
                  {repo.updated}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Caption */}
      <div className="border-t bg-muted/30 px-4 py-2.5 text-center text-[11px] text-muted-foreground">
        Your starred repos — ranked by what changed this week
      </div>
    </div>
  );
}
