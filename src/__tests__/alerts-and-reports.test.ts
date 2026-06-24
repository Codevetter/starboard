import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ALERT_RULES,
  mergeAlertRules,
  parseAlertRules,
  serializeAlertRules,
} from '@/lib/alert-preferences';
import {
  serializeCleanupDigest,
  serializeInsightReportPayload,
  serializeRadarReport,
  slugifyReportTitle,
} from '@/lib/insight-reports';
import { buildMaintainerDigest, type MaintainerDigestRepoInput } from '@/lib/maintainer-digest';
import { buildRadarReport, type RadarRepoInput } from '@/lib/release-radar';
import { buildWeeklyAlertDigest } from '@/lib/weekly-alerts';

const radarRepo: RadarRepoInput = {
  id: 1,
  name: 'repo',
  fullName: 'owner/repo',
  ownerLogin: 'owner',
  ownerAvatar: 'https://example.com/avatar.png',
  htmlUrl: 'https://github.com/owner/repo',
  description: 'A useful library',
  language: 'TypeScript',
  stargazersCount: 1000,
  archived: false,
  topics: ['typescript'],
  repoUpdatedAt: '2026-04-20T00:00:00Z',
  starredAt: '2026-01-01T00:00:00Z',
  starsThirtyDaysAgo: 900,
  thresholdEventsThirtyDays: 0,
};

const maintainerRepo: MaintainerDigestRepoInput = {
  id: 1,
  name: 'repo',
  fullName: 'owner/repo',
  htmlUrl: 'https://github.com/owner/repo',
  description: 'A useful project',
  language: 'TypeScript',
  stargazersCount: 1200,
  archived: false,
  repoUpdatedAt: '2026-05-01T00:00:00Z',
  starredAt: '2026-05-07T00:00:00Z',
  isStarred: true,
  isSaved: false,
  notes: null,
  collectionCount: 0,
  starsSevenDaysAgo: 1150,
  thresholdEventsSevenDays: 0,
};

describe('alert preferences', () => {
  it('defaults to quiet settings for new users', () => {
    expect(DEFAULT_ALERT_RULES.lanes).toEqual([]);
    expect(DEFAULT_ALERT_RULES.weeklyDigest).toBe(false);
    expect(DEFAULT_ALERT_RULES.inAppNotifications).toBe(false);
  });

  it('round-trips editable alert rules without schema changes', () => {
    const rules = mergeAlertRules(DEFAULT_ALERT_RULES, {
      lanes: ['release', 'momentum'],
      weeklyDigest: true,
      inAppNotifications: true,
      momentumMinDelta: 250,
    });
    const serialized = serializeAlertRules(rules);
    const parsed = parseAlertRules(serialized);
    expect(parsed.lanes).toEqual(['release', 'momentum']);
    expect(parsed.weeklyDigest).toBe(true);
    expect(parsed.momentumMinDelta).toBe(250);
  });
});

describe('weekly alerts', () => {
  const now = new Date('2026-05-08T00:00:00Z');

  it('generates lane-filtered weekly digest payloads', () => {
    const digest = buildWeeklyAlertDigest(
      [radarRepo],
      [maintainerRepo],
      {
        lanes: ['release'],
        weeklyDigest: true,
        inAppNotifications: true,
        momentumMinDelta: 100,
        dormantDays: 365,
      },
      now
    );

    expect(digest.summary.totalAlerts).toBeGreaterThan(0);
    expect(digest.alerts.every((alert) => alert.lane === 'release')).toBe(true);
    expect(digest.markdown).toContain('Weekly repository alerts');
  });

  it('returns no alerts when lanes are disabled', () => {
    const digest = buildWeeklyAlertDigest([radarRepo], [maintainerRepo], DEFAULT_ALERT_RULES, now);
    expect(digest.summary.totalAlerts).toBe(0);
  });
});

describe('insight reports', () => {
  it('serializes radar summaries without private notes', () => {
    const snapshot = serializeRadarReport(buildRadarReport([radarRepo]));
    expect(snapshot.type).toBe('radar');
    expect(snapshot.sections[0]?.items[0]?.title).toBe('owner/repo');
    expect(snapshot.summary.redactedPrivateNotes).toBe(1);
  });

  it('serializes cleanup digests for shareable stale-repo lists', () => {
    const snapshot = serializeCleanupDigest(buildMaintainerDigest([maintainerRepo]));
    const roundTrip = JSON.parse(serializeInsightReportPayload(snapshot));
    expect(roundTrip.type).toBe('cleanup');
    expect(roundTrip.sections.length).toBeGreaterThan(0);
  });

  it('creates readable report slugs', () => {
    expect(slugifyReportTitle('Release Radar / June 2026')).toBe('release-radar-june-2026');
  });
});
