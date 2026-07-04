/**
 * Send the weekly digest email — one email per opted-in user with 3–5
 * highlighted repos and why-it-matters context, linking back to Starboard.
 *
 * Runs from .github/workflows/weekly-threshold-digest.yml after the digest
 * issue step (same Monday schedule the digest generation already uses).
 *
 * Eligibility per user:
 *   - `weeklyDigest` enabled in alert rules (in-app digest opt-in)
 *   - `emailOptOut` not set (per-user email opt-out flag)
 *   - a public GitHub email captured at sign-in (users.email)
 *   - the generated digest has at least one alert (empty digests are skipped)
 *
 * Required env:
 *   TURSO_DATABASE_URL
 *   TURSO_AUTH_TOKEN
 * Fail-closed env (send is skipped with a log when unset — never set values in the repo):
 *   RESEND_API_KEY      — `gh secret set RESEND_API_KEY` for the Actions job
 * Optional env:
 *   DIGEST_EMAIL_FROM   — verified Resend sender, e.g. "Starboard <digest@example.com>"
 *   STARBOARD_APP_URL   — defaults to the production Worker URL
 */

import { createClient } from '@libsql/client';

import { parseAlertRules } from '../src/lib/alert-preferences';
import { buildWeeklyDigestEmail } from '../src/lib/digest-email';
import { isEmailConfigured, sendEmail } from '../src/lib/email';
import { loadMaintainerRepos, loadRadarRepos } from '../src/lib/weekly-alert-data';
import { buildWeeklyAlertDigest } from '../src/lib/weekly-alerts';

const APP_URL = process.env.STARBOARD_APP_URL || 'https://starboard.sarthakagrawal927.workers.dev';
const SEND_DELAY_MS = 600; // stay under Resend's 2 req/s free-tier rate limit

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!isEmailConfigured()) {
    console.warn(
      '[digest-email] RESEND_API_KEY is not set — skipping weekly digest email delivery (fail-closed). ' +
        'Set it with: gh secret set RESEND_API_KEY'
    );
    return;
  }

  if (!process.env.TURSO_DATABASE_URL) {
    throw new Error('TURSO_DATABASE_URL is required');
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const candidates = await db.execute({
    sql: `SELECT u.id, u.username, u.email, p.rules
          FROM user_alert_preferences p
          JOIN users u ON u.id = p.user_id
          WHERE u.email IS NOT NULL AND u.email != ''`,
    args: [],
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates.rows) {
    const userId = row.id as string;
    const username = row.username as string;
    const email = row.email as string;
    const rules = parseAlertRules(row.rules as string);

    if (!rules.weeklyDigest || rules.emailOptOut) {
      skipped++;
      continue;
    }

    const [radarRepos, maintainerRepos] = await Promise.all([
      loadRadarRepos(db, userId),
      loadMaintainerRepos(db, userId),
    ]);
    const digest = buildWeeklyAlertDigest(radarRepos, maintainerRepos, rules);
    const message = buildWeeklyDigestEmail(digest, { appUrl: APP_URL, username });

    if (!message) {
      console.info(`[digest-email] ${username}: no alerts this week — skipping`);
      skipped++;
      continue;
    }

    const result = await sendEmail({
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (result.sent) {
      console.info(
        `[digest-email] ${username}: sent ${message.highlights.length} highlights (${result.id ?? 'no id'})`
      );
      sent++;
    } else {
      console.error(`[digest-email] ${username}: send failed — ${result.error ?? result.skipped}`);
      failed++;
    }

    await sleep(SEND_DELAY_MS);
  }

  console.info(
    `[digest-email] done — ${sent} sent, ${skipped} skipped, ${failed} failed (${candidates.rows.length} candidates)`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[digest-email] fatal:', error);
  process.exit(1);
});
