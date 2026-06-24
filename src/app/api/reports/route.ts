import { NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getFleetProject } from '@/lib/fleet-project-data';
import { buildProjectRecommendationReport, type FleetRepoCandidate } from '@/lib/fleet-projects';
import {
  generateUniqueReportSlug,
  type InsightReportType,
  serializeCleanupDigest,
  serializeInsightReportPayload,
  serializeProjectRecommendations,
  serializeRadarReport,
} from '@/lib/insight-reports';
import { buildMaintainerDigest, type MaintainerDigestRepoInput } from '@/lib/maintainer-digest';
import { buildRadarReport, type RadarRepoInput } from '@/lib/release-radar';

interface CreateReportBody {
  type: InsightReportType;
  projectSlug?: string;
  redactPrivate?: boolean;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as CreateReportBody;
  const redactPrivate = body.redactPrivate !== false;

  let payload;
  let title: string;
  const reportType = body.type;

  if (reportType === 'radar') {
    const repos = await loadRadarRepos(session.user.githubId);
    payload = serializeRadarReport(buildRadarReport(repos), { redactPrivate });
    title = payload.title;
  } else if (reportType === 'cleanup') {
    const repos = await loadMaintainerRepos(session.user.githubId);
    payload = serializeCleanupDigest(buildMaintainerDigest(repos), { redactPrivate });
    title = payload.title;
  } else if (reportType === 'project-recommendations') {
    const project = body.projectSlug ? getFleetProject(body.projectSlug) : null;
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const candidates = await loadCandidateRepos(session.user.githubId);
    const report = buildProjectRecommendationReport(project, candidates, { limit: 20 });
    payload = serializeProjectRecommendations(report, { redactPrivate });
    title = payload.title;
  } else {
    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
  }

  const slug = await generateUniqueReportSlug(title, async (candidate) => {
    const existing = await db.execute({
      sql: 'SELECT 1 FROM insight_reports WHERE slug = ? LIMIT 1',
      args: [candidate],
    });
    return existing.rows.length > 0;
  });

  const snapshotAt = payload.snapshotAt;
  await db.execute({
    sql: `INSERT INTO insight_reports
            (user_id, slug, report_type, title, snapshot_at, payload, redact_private, is_public)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    args: [
      session.user.githubId,
      slug,
      reportType,
      title,
      snapshotAt,
      serializeInsightReportPayload(payload),
      redactPrivate ? 1 : 0,
    ],
  });

  return NextResponse.json({
    slug,
    url: `/reports/${slug}`,
    type: reportType,
    title,
    snapshotAt,
  });
}

async function loadRadarRepos(userId: string): Promise<RadarRepoInput[]> {
  const result = await db.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.owner_login,
                 r.owner_avatar,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 r.repo_updated_at,
                 ur.starred_at,
                 (
                   SELECT rss.stargazers_count
                   FROM repo_star_snapshots rss
                   WHERE rss.repo_id = r.id
                     AND datetime(rss.captured_at) <= datetime('now', '-30 days')
                   ORDER BY datetime(rss.captured_at) DESC
                   LIMIT 1
                 ) AS stars_30d_ago,
                 (
                   SELECT COUNT(*)
                   FROM repo_threshold_events rte
                   WHERE rte.repo_id = r.id
                     AND datetime(rte.crossed_at) >= datetime('now', '-30 days')
                 ) AS threshold_events_30d
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ur.user_id = ?
            AND (ur.is_starred = 1 OR ur.is_saved = 1)
          ORDER BY r.repo_updated_at DESC, r.stargazers_count DESC
          LIMIT 500`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    fullName: row.full_name as string,
    ownerLogin: row.owner_login as string,
    ownerAvatar: row.owner_avatar as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stargazersCount: row.stargazers_count as number,
    archived: Boolean(row.archived),
    topics: JSON.parse((row.topics as string) || '[]'),
    repoUpdatedAt: row.repo_updated_at as string | null,
    starredAt: row.starred_at as string | null,
    starsThirtyDaysAgo: row.stars_30d_ago as number | null,
    thresholdEventsThirtyDays: row.threshold_events_30d as number,
  }));
}

async function loadMaintainerRepos(userId: string): Promise<MaintainerDigestRepoInput[]> {
  const result = await db.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.repo_updated_at,
                 ur.starred_at,
                 ur.is_starred,
                 ur.is_saved,
                 ur.notes,
                 (
                   SELECT COUNT(*)
                   FROM user_repo_lists url
                   WHERE url.user_id = ur.user_id
                     AND url.repo_id = ur.repo_id
                 ) AS collection_count,
                 (
                   SELECT rss.stargazers_count
                   FROM repo_star_snapshots rss
                   WHERE rss.repo_id = r.id
                     AND datetime(rss.captured_at) <= datetime('now', '-7 days')
                   ORDER BY datetime(rss.captured_at) DESC
                   LIMIT 1
                 ) AS stars_7d_ago,
                 (
                   SELECT COUNT(*)
                   FROM repo_threshold_events rte
                   WHERE rte.repo_id = r.id
                     AND datetime(rte.crossed_at) >= datetime('now', '-7 days')
                 ) AS threshold_events_7d
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ur.user_id = ?
            AND (ur.is_starred = 1 OR ur.is_saved = 1)
          ORDER BY ur.starred_at DESC, r.stargazers_count DESC
          LIMIT 500`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    fullName: row.full_name as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stargazersCount: row.stargazers_count as number,
    archived: Boolean(row.archived),
    repoUpdatedAt: row.repo_updated_at as string | null,
    starredAt: row.starred_at as string | null,
    isStarred: Boolean(row.is_starred),
    isSaved: Boolean(row.is_saved),
    notes: row.notes as string | null,
    collectionCount: row.collection_count as number,
    starsSevenDaysAgo: row.stars_7d_ago as number | null,
    thresholdEventsSevenDays: row.threshold_events_7d as number,
  }));
}

async function loadCandidateRepos(userId: string): Promise<FleetRepoCandidate[]> {
  const result = await db.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 r.repo_updated_at,
                 ur.starred_at,
                 ur.is_saved,
                 aim.summary AS ai_summary,
                 aim.category AS ai_category,
                 aim.subcategories AS ai_subcategories,
                 aim.use_cases AS ai_use_cases,
                 aim.keywords AS ai_keywords
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id
          WHERE ur.user_id = ?
            AND (ur.is_starred = 1 OR ur.is_saved = 1)
          ORDER BY ur.is_saved DESC, r.stargazers_count DESC, r.repo_updated_at DESC
          LIMIT 500`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    fullName: row.full_name as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stargazersCount: row.stargazers_count as number,
    archived: Boolean(row.archived),
    topics: parseStringArray(row.topics as string),
    repoUpdatedAt: row.repo_updated_at as string | null,
    starredAt: row.starred_at as string | null,
    isSaved: Boolean(row.is_saved),
    ai: row.ai_summary
      ? {
          summary: row.ai_summary as string,
          category: row.ai_category as string | null,
          subcategories: parseStringArray(row.ai_subcategories as string),
          useCases: parseStringArray(row.ai_use_cases as string),
          keywords: parseStringArray(row.ai_keywords as string),
        }
      : null,
  }));
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
