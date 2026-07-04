import { NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { loadAlertRules, loadRadarRepos } from '@/lib/weekly-alert-data';
import { filterRadarAlerts } from '@/lib/weekly-alerts';

export async function GET() {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [rules, radarRepos] = await Promise.all([
    loadAlertRules(db, session.user.githubId),
    loadRadarRepos(db, session.user.githubId),
  ]);

  if (!rules.inAppNotifications || rules.lanes.length === 0) {
    return NextResponse.json({
      enabled: false,
      alerts: [],
      rules,
    });
  }

  const alerts = filterRadarAlerts(radarRepos, rules);
  return NextResponse.json({
    enabled: true,
    alerts,
    rules,
  });
}
