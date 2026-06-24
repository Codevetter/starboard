import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  type AlertRules,
  DEFAULT_ALERT_RULES,
  mergeAlertRules,
  parseAlertRules,
  serializeAlertRules,
} from '@/lib/alert-preferences';
import { auth } from '@/lib/auth';

async function getOrCreateRules(userId: string): Promise<AlertRules> {
  const existing = await db.execute({
    sql: 'SELECT rules FROM user_alert_preferences WHERE user_id = ?',
    args: [userId],
  });

  if (existing.rows.length > 0) {
    return parseAlertRules(existing.rows[0]!.rules as string);
  }

  const rules = { ...DEFAULT_ALERT_RULES };
  await db.execute({
    sql: 'INSERT INTO user_alert_preferences (user_id, rules) VALUES (?, ?)',
    args: [userId, serializeAlertRules(rules)],
  });
  return rules;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rules = await getOrCreateRules(session.user.githubId);
  return NextResponse.json({ rules });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as Partial<AlertRules>;
  const current = await getOrCreateRules(session.user.githubId);
  const next = mergeAlertRules(current, body);

  await db.execute({
    sql: `INSERT INTO user_alert_preferences (user_id, rules, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            rules = excluded.rules,
            updated_at = excluded.updated_at`,
    args: [session.user.githubId, serializeAlertRules(next)],
  });

  return NextResponse.json({ rules: next });
}
