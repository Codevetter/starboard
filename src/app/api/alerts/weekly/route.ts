import { NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { loadAlertRules, loadMaintainerRepos, loadRadarRepos } from '@/lib/weekly-alert-data';
import { buildWeeklyAlertDigest } from '@/lib/weekly-alerts';

export async function GET() {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [rules, radarRepos, maintainerRepos] = await Promise.all([
    loadAlertRules(db, session.user.githubId),
    loadRadarRepos(db, session.user.githubId),
    loadMaintainerRepos(db, session.user.githubId),
  ]);

  const digest = buildWeeklyAlertDigest(radarRepos, maintainerRepos, rules);
  return NextResponse.json(digest);
}
