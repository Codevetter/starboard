import type { AlertLane, AlertRules } from '@/lib/alert-preferences';
import type { MaintainerDigest, MaintainerDigestRepoInput } from '@/lib/maintainer-digest';
import { buildMaintainerDigest } from '@/lib/maintainer-digest';
import {
  analyzeRadarRepo,
  buildRadarReport,
  type RadarRepo,
  type RadarRepoInput,
} from '@/lib/release-radar';

export interface WeeklyAlertItem {
  id: string;
  lane: AlertLane;
  repoId: number;
  fullName: string;
  title: string;
  detail: string;
  sourceUrl: string;
  starboardUrl: string;
  priority: 'info' | 'watch' | 'urgent';
}

export interface WeeklyAlertDigest {
  id: string;
  generatedAt: string;
  lookbackDays: number;
  enabledLanes: AlertLane[];
  summary: {
    totalAlerts: number;
    release: number;
    maintenance: number;
    momentum: number;
  };
  alerts: WeeklyAlertItem[];
  markdown: string;
}

function laneFromDigestGroup(groupId: string): AlertLane | null {
  if (groupId === 'recent_releases') return 'release';
  if (groupId === 'high_momentum') return 'momentum';
  if (groupId === 'at_risk') return 'maintenance';
  return null;
}

function laneFromRadarRepo(repo: RadarRepo, rules: AlertRules): AlertLane | null {
  const primary = repo.primaryLane;
  if (!rules.lanes.includes(primary)) return null;

  if (primary === 'momentum') {
    const delta = repo.starDeltaThirtyDays ?? 0;
    if (delta < rules.momentumMinDelta && (repo.thresholdEventsThirtyDays ?? 0) === 0) {
      return null;
    }
  }

  if (primary === 'maintenance') {
    const dormant = repo.daysSinceUpdate ?? 0;
    if (dormant < rules.dormantDays && !repo.archived) return null;
  }

  return primary;
}

function radarAlertItem(repo: RadarRepo, lane: AlertLane): WeeklyAlertItem {
  const topSignal = repo.signals[0];
  return {
    id: `radar:${lane}:${repo.id}`,
    lane,
    repoId: repo.id,
    fullName: repo.fullName,
    title: repo.fullName,
    detail: topSignal?.label ?? 'Signal detected',
    sourceUrl: repo.htmlUrl,
    starboardUrl: `/explore/${repo.fullName}`,
    priority: topSignal?.tone === 'risk' ? 'urgent' : topSignal?.tone === 'good' ? 'info' : 'watch',
  };
}

function digestAlertItem(
  digest: MaintainerDigest,
  groupId: string,
  lane: AlertLane
): WeeklyAlertItem[] {
  const group = digest.groups.find((item) => item.id === groupId);
  if (!group) return [];
  return group.items.map((item) => ({
    id: `digest:${lane}:${item.repoId}`,
    lane,
    repoId: item.repoId,
    fullName: item.fullName,
    title: item.title,
    detail: item.detail,
    sourceUrl: item.sourceUrl,
    starboardUrl: item.starboardUrl,
    priority: item.priority,
  }));
}

export function buildWeeklyAlertDigest(
  radarRepos: RadarRepoInput[],
  maintainerRepos: MaintainerDigestRepoInput[],
  rules: AlertRules,
  now = new Date(),
  lookbackDays = 7
): WeeklyAlertDigest {
  const enabledLanes = rules.lanes;
  const alerts: WeeklyAlertItem[] = [];
  const seen = new Set<string>();

  const radarReport = buildRadarReport(radarRepos, now);
  for (const repo of radarReport.repos) {
    const lane = laneFromRadarRepo(repo, rules);
    if (!lane) continue;
    const key = `${lane}:${repo.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    alerts.push(radarAlertItem(repo, lane));
  }

  if (rules.weeklyDigest) {
    const digest = buildMaintainerDigest(maintainerRepos, now, lookbackDays);
    for (const group of digest.groups) {
      const lane = laneFromDigestGroup(group.id);
      if (!lane || !enabledLanes.includes(lane)) continue;
      for (const item of digestAlertItem(digest, group.id, lane)) {
        const key = `${lane}:${item.repoId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        alerts.push(item);
      }
    }
  }

  const sortedAlerts = alerts.sort((a, b) => {
    const priorityScore = { urgent: 3, watch: 2, info: 1 };
    return (
      priorityScore[b.priority] - priorityScore[a.priority] || a.fullName.localeCompare(b.fullName)
    );
  });

  const summary = {
    totalAlerts: sortedAlerts.length,
    release: sortedAlerts.filter((item) => item.lane === 'release').length,
    maintenance: sortedAlerts.filter((item) => item.lane === 'maintenance').length,
    momentum: sortedAlerts.filter((item) => item.lane === 'momentum').length,
  };

  return {
    id: `weekly-alerts-${now.toISOString().slice(0, 10)}`,
    generatedAt: now.toISOString(),
    lookbackDays,
    enabledLanes,
    summary,
    alerts: sortedAlerts,
    markdown: buildWeeklyAlertMarkdown(sortedAlerts, summary, now),
  };
}

function buildWeeklyAlertMarkdown(
  alerts: WeeklyAlertItem[],
  summary: WeeklyAlertDigest['summary'],
  now: Date
): string {
  const lines = [
    `# Weekly repository alerts`,
    '',
    `Generated: ${now.toISOString()}`,
    `Total alerts: ${summary.totalAlerts}`,
    '',
  ];

  for (const lane of ['release', 'momentum', 'maintenance'] as AlertLane[]) {
    const laneAlerts = alerts.filter((item) => item.lane === lane);
    if (laneAlerts.length === 0) continue;
    lines.push(`## ${lane}`);
    lines.push('');
    for (const alert of laneAlerts) {
      lines.push(`- [${alert.fullName}](${alert.sourceUrl}) — ${alert.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function filterRadarAlerts(
  repos: RadarRepoInput[],
  rules: AlertRules,
  now = new Date()
): WeeklyAlertItem[] {
  return buildRadarReport(repos, now)
    .repos.map((repo) => {
      const lane = laneFromRadarRepo(repo, rules);
      return lane ? radarAlertItem(repo, lane) : null;
    })
    .filter((item): item is WeeklyAlertItem => item !== null);
}

export function previewRadarRepo(repo: RadarRepoInput, now = new Date()): RadarRepo {
  return analyzeRadarRepo(repo, now);
}
