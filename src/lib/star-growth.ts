export interface StarSnapshot {
  repoId?: number;
  stargazersCount: number;
  capturedAt: string;
}

export interface StarGrowth {
  first: StarSnapshot | null;
  last: StarSnapshot | null;
  starsGained: number | null;
  percentGrowth: number | null;
  starsPerDay: number | null;
  days: number;
  enoughHistory: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function snapshotTime(snapshot: StarSnapshot): number {
  const time = new Date(snapshot.capturedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function calculateStarGrowth(snapshots: StarSnapshot[]): StarGrowth {
  const ordered = [...snapshots]
    .filter((snapshot) => Number.isFinite(snapshot.stargazersCount) && snapshot.capturedAt)
    .sort((a, b) => snapshotTime(a) - snapshotTime(b));

  const first = ordered[0] ?? null;
  const last = ordered[ordered.length - 1] ?? null;
  if (!first || !last || first === last) {
    return {
      first,
      last,
      starsGained: null,
      percentGrowth: null,
      starsPerDay: null,
      days: 0,
      enoughHistory: false,
    };
  }

  const elapsedMs = Math.max(0, snapshotTime(last) - snapshotTime(first));
  const days = elapsedMs / DAY_MS;
  const starsGained = Math.max(0, last.stargazersCount - first.stargazersCount);
  const percentGrowth =
    first.stargazersCount > 0 ? (starsGained / first.stargazersCount) * 100 : null;

  return {
    first,
    last,
    starsGained,
    percentGrowth,
    starsPerDay: days > 0 ? starsGained / days : null,
    days,
    enoughHistory: elapsedMs > 0,
  };
}

export interface RankedGrowthRepo {
  repoId: number;
  currentStars: number;
  growth: StarGrowth;
}

export type GrowthRankMode = 'absolute' | 'percent' | 'per-day';

export function rankGrowthRepos(
  repos: RankedGrowthRepo[],
  mode: GrowthRankMode = 'absolute'
): RankedGrowthRepo[] {
  return [...repos]
    .filter((repo) => repo.growth.enoughHistory && (repo.growth.starsGained ?? 0) > 0)
    .sort((a, b) => {
      const aScore =
        mode === 'percent'
          ? (a.growth.percentGrowth ?? -1)
          : mode === 'per-day'
            ? (a.growth.starsPerDay ?? -1)
            : (a.growth.starsGained ?? -1);
      const bScore =
        mode === 'percent'
          ? (b.growth.percentGrowth ?? -1)
          : mode === 'per-day'
            ? (b.growth.starsPerDay ?? -1)
            : (b.growth.starsGained ?? -1);

      if (bScore !== aScore) return bScore - aScore;
      return b.currentStars - a.currentStars;
    });
}
