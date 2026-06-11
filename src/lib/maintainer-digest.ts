export type DigestGroupId =
  | "newly_starred"
  | "recent_releases"
  | "high_momentum"
  | "at_risk"
  | "suggested_actions";

export interface MaintainerDigestRepoInput {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  archived: boolean;
  repoUpdatedAt: string | null;
  starredAt: string | null;
  isStarred: boolean;
  isSaved: boolean;
  notes: string | null;
  collectionCount: number;
  starsSevenDaysAgo: number | null;
  thresholdEventsSevenDays: number;
}

export interface DigestItem {
  id: string;
  group: DigestGroupId;
  repoId: number;
  fullName: string;
  title: string;
  description: string;
  detail: string;
  sourceUrl: string;
  starboardUrl: string;
  actionLabel: string;
  priority: "info" | "watch" | "urgent";
}

export interface DigestGroup {
  id: DigestGroupId;
  title: string;
  description: string;
  items: DigestItem[];
}

export interface MaintainerDigest {
  id: string;
  generatedAt: string;
  lookbackDays: number;
  summary: {
    totalItems: number;
    newlyStarred: number;
    recentReleases: number;
    highMomentum: number;
    atRisk: number;
    suggestedActions: number;
  };
  groups: DigestGroup[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 7;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(now: Date, value: string | null): number | null {
  const date = parseDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

function isWithinDays(now: Date, value: string | null, days: number): boolean {
  const age = daysBetween(now, value);
  return age !== null && age <= days;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

function formatAge(days: number | null): string {
  if (days === null) return "unknown";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

function starDelta(repo: MaintainerDigestRepoInput): number | null {
  if (typeof repo.starsSevenDaysAgo !== "number") return null;
  return repo.stargazersCount - repo.starsSevenDaysAgo;
}

function repoDescription(repo: MaintainerDigestRepoInput): string {
  return repo.description?.trim() || `${repo.language ?? "Repository"} with ${compactNumber(repo.stargazersCount)} stars.`;
}

function itemId(prefix: DigestGroupId, repo: MaintainerDigestRepoInput): string {
  return `${prefix}:${repo.id}`;
}

function toStarboardUrl(repo: MaintainerDigestRepoInput): string {
  return `/explore/${repo.fullName}`;
}

function sortByStarsDesc(a: MaintainerDigestRepoInput, b: MaintainerDigestRepoInput): number {
  return b.stargazersCount - a.stargazersCount;
}

function sortByOldestUpdate(
  a: MaintainerDigestRepoInput,
  b: MaintainerDigestRepoInput,
  now: Date
): number {
  const aDays = daysBetween(now, a.repoUpdatedAt) ?? 0;
  const bDays = daysBetween(now, b.repoUpdatedAt) ?? 0;
  return bDays - aDays;
}

function buildNewlyStarredItem(
  repo: MaintainerDigestRepoInput,
  now: Date
): DigestItem {
  const starredAge = formatAge(daysBetween(now, repo.starredAt));
  return {
    id: itemId("newly_starred", repo),
    group: "newly_starred",
    repoId: repo.id,
    fullName: repo.fullName,
    title: repo.fullName,
    description: repoDescription(repo),
    detail: `Added to your library ${starredAge}.`,
    sourceUrl: repo.htmlUrl,
    starboardUrl: toStarboardUrl(repo),
    actionLabel: repo.collectionCount > 0 ? "Review notes" : "Add to a collection",
    priority: "info",
  };
}

function buildHighMomentumItem(
  repo: MaintainerDigestRepoInput
): DigestItem {
  const delta = starDelta(repo);
  const signal =
    repo.thresholdEventsSevenDays > 0
      ? `${repo.thresholdEventsSevenDays} threshold crossing${repo.thresholdEventsSevenDays === 1 ? "" : "s"}`
      : delta !== null && delta > 0
        ? `+${compactNumber(delta)} stars this week`
        : `${compactNumber(repo.stargazersCount)} total stars`;

  return {
    id: itemId("high_momentum", repo),
    group: "high_momentum",
    repoId: repo.id,
    fullName: repo.fullName,
    title: repo.fullName,
    description: repoDescription(repo),
    detail: signal,
    sourceUrl: repo.htmlUrl,
    starboardUrl: toStarboardUrl(repo),
    actionLabel: "Investigate Trend",
    priority: "watch",
  };
}

function buildAtRiskItem(
  repo: MaintainerDigestRepoInput,
  now: Date
): DigestItem {
  const updateAge = daysBetween(now, repo.repoUpdatedAt);
  const delta = starDelta(repo);
  let detail = `Saved repo last updated ${formatAge(updateAge)}.`;
  let actionLabel = repo.archived ? "Archive or remove" : "Review saved status";
  let priority: "watch" | "urgent" = repo.archived ? "urgent" : "watch";

  if (delta !== null && delta < -50) {
    detail = `Lost ${compactNumber(Math.abs(delta))} stars this week.`;
    actionLabel = "Re-evaluate";
    priority = "urgent";
  }

  return {
    id: itemId("at_risk", repo),
    group: "at_risk",
    repoId: repo.id,
    fullName: repo.fullName,
    title: repo.fullName,
    description: repoDescription(repo),
    detail,
    sourceUrl: repo.htmlUrl,
    starboardUrl: toStarboardUrl(repo),
    actionLabel,
    priority,
  };
}

function buildRecentReleasesItem(
  repo: MaintainerDigestRepoInput,
  now: Date
): DigestItem {
  const updateAge = daysBetween(now, repo.repoUpdatedAt);
  const ageLabel = updateAge !== null ? formatAge(updateAge) : "recently";
  return {
    id: itemId("recent_releases", repo),
    group: "recent_releases",
    repoId: repo.id,
    fullName: repo.fullName,
    title: repo.fullName,
    description: repoDescription(repo),
    detail: `Updated ${ageLabel}.`,
    sourceUrl: repo.htmlUrl,
    starboardUrl: toStarboardUrl(repo),
    actionLabel: "Review update",
    priority: "info",
  };
}

function buildSuggestedActionItem(
  repo: MaintainerDigestRepoInput,
  reason: string,
  actionLabel: string
): DigestItem {
  return {
    id: `suggested_actions:${repo.id}:${actionLabel.toLowerCase().replaceAll(" ", "-")}`,
    group: "suggested_actions",
    repoId: repo.id,
    fullName: repo.fullName,
    title: repo.fullName,
    description: repoDescription(repo),
    detail: reason,
    sourceUrl: repo.htmlUrl,
    starboardUrl: toStarboardUrl(repo),
    actionLabel,
    priority: "info",
  };
}

export function buildMaintainerDigest(
  repos: MaintainerDigestRepoInput[],
  now = new Date(),
  lookbackDays = DEFAULT_LOOKBACK_DAYS
): MaintainerDigest {
  const recentRepos = repos
    .filter((repo) => isWithinDays(now, repo.starredAt, lookbackDays))
    .sort((a, b) => {
      const aTime = parseDate(a.starredAt)?.getTime() ?? 0;
      const bTime = parseDate(b.starredAt)?.getTime() ?? 0;
      return bTime - aTime;
    });

  const highMomentumRepos = repos
    .filter((repo) => {
      const delta = starDelta(repo) ?? 0;
      return (
        repo.stargazersCount >= 5000 ||
        delta >= 100 ||
        repo.thresholdEventsSevenDays > 0
      );
    })
    .sort((a, b) => {
      const aScore = (starDelta(a) ?? 0) + a.thresholdEventsSevenDays * 1000 + a.stargazersCount / 1000;
      const bScore = (starDelta(b) ?? 0) + b.thresholdEventsSevenDays * 1000 + b.stargazersCount / 1000;
      return bScore - aScore;
    });

  const newlyStarredIds = new Set(recentRepos.map((r) => r.id));

  const recentReleasesRepos = repos
    .filter((repo) => {
      if (newlyStarredIds.has(repo.id)) return false;
      return isWithinDays(now, repo.repoUpdatedAt, 30);
    })
    .sort((a, b) => {
      const aTime = parseDate(a.repoUpdatedAt)?.getTime() ?? 0;
      const bTime = parseDate(b.repoUpdatedAt)?.getTime() ?? 0;
      return bTime - aTime;
    });

  const atRiskRepos = repos
    .filter((repo) => {
      const updateAge = daysBetween(now, repo.repoUpdatedAt);
      const delta = starDelta(repo);
      return (repo.isSaved && updateAge !== null && updateAge >= 365) || (delta !== null && delta < -50);
    })
    .sort((a, b) => sortByOldestUpdate(a, b, now));

  const suggestedActions: DigestItem[] = [];
  for (const repo of recentRepos.filter((item) => item.collectionCount === 0).slice(0, 4)) {
    suggestedActions.push(
      buildSuggestedActionItem(
        repo,
        "Newly added and not assigned to a collection yet.",
        "Assign collection"
      )
    );
  }
  for (const repo of atRiskRepos.filter((item) => !item.notes).slice(0, 3)) {
    suggestedActions.push(
      buildSuggestedActionItem(
        repo,
        "Saved for later with no note explaining why it still matters.",
        "Add decision note"
      )
    );
  }
  for (const repo of highMomentumRepos.filter((item) => !item.notes).sort(sortByStarsDesc).slice(0, 3)) {
    if (suggestedActions.some((item) => item.repoId === repo.id)) continue;
    suggestedActions.push(
      buildSuggestedActionItem(
        repo,
        "High-momentum repo has no maintainer note.",
        "Capture why"
      )
    );
  }

  const groups: DigestGroup[] = [
    {
      id: "newly_starred",
      title: "Review New Additions",
      description: "Repos added to your library in the last week.",
      items: recentRepos.slice(0, 6).map((repo) => buildNewlyStarredItem(repo, now)),
    },
    {
      id: "recent_releases",
      title: "Recent Releases",
      description: "Library repos with activity in the last 30 days.",
      items: recentReleasesRepos.slice(0, 6).map((repo) => buildRecentReleasesItem(repo, now)),
    },
    {
      id: "high_momentum",
      title: "Growth & Momentum",
      description: "Repos in your library with strong star counts or recent growth.",
      items: highMomentumRepos.slice(0, 6).map(buildHighMomentumItem),
    },
    {
      id: "at_risk",
      title: "At-Risk & Stale",
      description: "Saved repos that may need pruning or a note.",
      items: atRiskRepos.slice(0, 6).map((repo) => buildAtRiskItem(repo, now)),
    },
    {
      id: "suggested_actions",
      title: "Suggested Actions",
      description: "Small cleanup decisions to keep the library useful.",
      items: suggestedActions.slice(0, 8),
    },
  ];

  return {
    id: `weekly-${now.toISOString().slice(0, 10)}`,
    generatedAt: now.toISOString(),
    lookbackDays,
    summary: {
      totalItems: groups.reduce((sum, group) => sum + group.items.length, 0),
      newlyStarred: groups.find((group) => group.id === "newly_starred")?.items.length ?? 0,
      recentReleases: groups.find((group) => group.id === "recent_releases")?.items.length ?? 0,
      highMomentum: groups.find((group) => group.id === "high_momentum")?.items.length ?? 0,
      atRisk: groups.find((group) => group.id === "at_risk")?.items.length ?? 0,
      suggestedActions: groups.find((group) => group.id === "suggested_actions")?.items.length ?? 0,
    },
    groups,
  };
}
