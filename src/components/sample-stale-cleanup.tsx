import { Archive, CheckCircle2, Trash2 } from 'lucide-react';

type Verdict = 'keep' | 'remove';

type StaleRepo = {
  owner: string;
  name: string;
  starredAgo: string;
  lastActivity: string;
  verdict: Verdict;
  reason: string;
};

const STALE_REPOS: StaleRepo[] = [
  {
    owner: 'atom',
    name: 'atom',
    starredAgo: '2 yr ago',
    lastActivity: 'Archived Dec 2022',
    verdict: 'remove',
    reason: 'Officially archived by GitHub. No future releases. Successor is Pulsar.',
  },
  {
    owner: 'adobe',
    name: 'brackets',
    starredAgo: '3 yr ago',
    lastActivity: 'Last commit 4 yr ago',
    verdict: 'remove',
    reason: 'Project sunset in 2021. Archived repo with no ongoing maintenance.',
  },
  {
    owner: 'nicolodavis',
    name: 'boardgame.io',
    starredAgo: '18 mo ago',
    lastActivity: 'Last commit 22 mo ago',
    verdict: 'remove',
    reason: 'Repo has stalled — no releases or activity in almost 2 years.',
  },
  {
    owner: 'tiangolo',
    name: 'fastapi',
    starredAgo: '1 yr ago',
    lastActivity: 'Committed 2d ago',
    verdict: 'keep',
    reason: 'High-velocity project — 40+ commits/month. Release notes worth tracking.',
  },
  {
    owner: 'tokio-rs',
    name: 'axum',
    starredAgo: '8 mo ago',
    lastActivity: 'Released 5d ago',
    verdict: 'keep',
    reason: 'Active Rust web framework. New patch release this week, used in prod.',
  },
];

const verdictStyle: Record<Verdict, { row: string; badge: string; icon: React.ReactNode }> = {
  remove: {
    row: 'border-l-2 border-l-rose-500/60',
    badge: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    icon: <Trash2 className="size-3 shrink-0" />,
  },
  keep: {
    row: 'border-l-2 border-l-emerald-500/60',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    icon: <CheckCircle2 className="size-3 shrink-0" />,
  },
};

export function SampleStaleCleanup() {
  const removeCount = STALE_REPOS.filter((r) => r.verdict === 'remove').length;
  const keepCount = STALE_REPOS.filter((r) => r.verdict === 'keep').length;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none w-full select-none rounded-xl border bg-card shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Archive className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Stale Star Cleanup</span>
          <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            23 to review
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-rose-500">
            <Trash2 className="size-3" />
            {removeCount} remove
          </span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" />
            {keepCount} keep
          </span>
        </div>
      </div>

      {/* Repo rows */}
      <ul className="divide-y">
        {STALE_REPOS.map((repo) => {
          const style = verdictStyle[repo.verdict];
          return (
            <li
              key={`${repo.owner}/${repo.name}`}
              className={`flex items-start gap-3 px-4 py-2.5 ${style.row}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    <span className="text-muted-foreground">{repo.owner}/</span>
                    {repo.name}
                  </span>
                  <span
                    className={`ml-auto shrink-0 flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${style.badge}`}
                  >
                    {style.icon}
                    {repo.verdict}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] italic text-muted-foreground/70">{repo.reason}</p>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>Starred {repo.starredAgo}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{repo.lastActivity}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="border-t bg-muted/30 px-4 py-2 text-center text-[11px] text-muted-foreground">
        Starboard surfaces stale stars so you unstar noise, not signal
      </div>
    </div>
  );
}
