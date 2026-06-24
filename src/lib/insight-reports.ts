import type { FleetProjectRecommendationReport } from '@/lib/fleet-projects';
import type { MaintainerDigest } from '@/lib/maintainer-digest';
import type { RadarReport } from '@/lib/release-radar';

export type InsightReportType = 'radar' | 'project-recommendations' | 'cleanup';

export interface InsightReportSnapshot {
  type: InsightReportType;
  title: string;
  snapshotAt: string;
  summary: Record<string, number | string>;
  sections: InsightReportSection[];
}

export interface InsightReportSection {
  id: string;
  title: string;
  description: string;
  items: InsightReportItem[];
}

export interface InsightReportItem {
  id: string;
  title: string;
  detail: string;
  reasons: string[];
  sourceUrl?: string;
  metadata?: Record<string, string | number | null>;
}

export interface PublicInsightReport {
  slug: string;
  type: InsightReportType;
  title: string;
  snapshotAt: string;
  ownerUsername: string;
  payload: InsightReportSnapshot;
}

const DEFAULT_SUFFIX = () => Math.random().toString(16).slice(2, 6);

export function slugifyReportTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70) || 'report'
  );
}

export async function generateUniqueReportSlug(
  title: string,
  exists: (slug: string) => Promise<boolean>,
  suffix: () => string = DEFAULT_SUFFIX
): Promise<string> {
  const base = slugifyReportTitle(title);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${suffix()}`.slice(0, 100);
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 100);
}

export function serializeRadarReport(
  report: RadarReport,
  options: { redactPrivate?: boolean } = {}
): InsightReportSnapshot {
  const redactPrivate = options.redactPrivate ?? true;
  return {
    type: 'radar',
    title: 'Release radar summary',
    snapshotAt: new Date().toISOString(),
    summary: {
      total: report.summary.total,
      releaseCount: report.summary.releaseCount,
      maintenanceCount: report.summary.maintenanceCount,
      momentumCount: report.summary.momentumCount,
      redactedPrivateNotes: redactPrivate ? 1 : 0,
    },
    sections: [
      {
        id: 'high-signal',
        title: 'High-signal repositories',
        description: 'Top radar items ranked by signal strength.',
        items: report.repos.slice(0, 12).map((repo) => ({
          id: `radar-${repo.id}`,
          title: repo.fullName,
          detail: repo.description ?? 'No description available.',
          reasons: repo.signals.slice(0, 3).map((signal) => signal.label),
          sourceUrl: repo.htmlUrl,
          metadata: {
            lane: repo.primaryLane,
            stars: repo.stargazersCount,
            starDelta30d: repo.starDeltaThirtyDays,
          },
        })),
      },
    ],
  };
}

export function serializeProjectRecommendations(
  report: FleetProjectRecommendationReport,
  options: { redactPrivate?: boolean } = {}
): InsightReportSnapshot {
  const redactPrivate = options.redactPrivate ?? true;
  return {
    type: 'project-recommendations',
    title: `${report.project.name} recommendations`,
    snapshotAt: new Date().toISOString(),
    summary: {
      project: report.project.name,
      returned: report.summary.returned,
      useNow: report.summary.useNow,
      prototype: report.summary.prototype,
      research: report.summary.research,
      redactedPrivateNotes: redactPrivate ? 1 : 0,
    },
    sections: report.byFeatureArea
      .filter((section) => section.recommendations.length > 0)
      .map((section) => ({
        id: section.featureArea.id,
        title: section.featureArea.label,
        description: section.featureArea.description,
        items: section.recommendations.slice(0, 6).map((recommendation) => ({
          id: `rec-${recommendation.id}-${section.featureArea.id}`,
          title: recommendation.fullName,
          detail: recommendation.suggestedUse,
          reasons: recommendation.reasons,
          sourceUrl: recommendation.htmlUrl,
          metadata: {
            action: recommendation.action,
            score: recommendation.score,
            language: recommendation.language,
          },
        })),
      })),
  };
}

export function serializeCleanupDigest(
  digest: MaintainerDigest,
  options: { redactPrivate?: boolean } = {}
): InsightReportSnapshot {
  const redactPrivate = options.redactPrivate ?? true;
  const cleanupGroups = digest.groups.filter((group) =>
    ['at_risk', 'suggested_actions'].includes(group.id)
  );

  return {
    type: 'cleanup',
    title: 'Stale repository cleanup',
    snapshotAt: digest.generatedAt,
    summary: {
      totalItems: digest.summary.totalItems,
      atRisk: digest.summary.atRisk,
      suggestedActions: digest.summary.suggestedActions,
      redactedPrivateNotes: redactPrivate ? 1 : 0,
    },
    sections: cleanupGroups.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      items: group.items.map((item) => ({
        id: item.id,
        title: item.fullName,
        detail: item.detail,
        reasons: [item.actionLabel],
        sourceUrl: item.sourceUrl,
        metadata: {
          priority: item.priority,
        },
      })),
    })),
  };
}

export function parseInsightReportPayload(raw: string): InsightReportSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as InsightReportSnapshot;
    if (!parsed.type || !parsed.title || !Array.isArray(parsed.sections)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeInsightReportPayload(payload: InsightReportSnapshot): string {
  return JSON.stringify(payload);
}
