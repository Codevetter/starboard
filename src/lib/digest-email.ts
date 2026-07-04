import type { AlertLane } from '@/lib/alert-preferences';
import type { WeeklyAlertDigest, WeeklyAlertItem } from '@/lib/weekly-alerts';

/**
 * Pure rendering for the weekly digest email. Takes the digest payload the app
 * already generates (buildWeeklyAlertDigest) and turns it into a 3–5 repo
 * highlight email that links back to Starboard. No I/O here — the send path
 * lives in scripts/send-weekly-digest-emails.ts via src/lib/email.ts.
 */

export const MAX_HIGHLIGHTS = 5;

const LANE_LABELS: Record<AlertLane, string> = {
  release: 'Release',
  maintenance: 'Maintenance',
  momentum: 'Momentum',
};

const PRIORITY_LABELS: Record<WeeklyAlertItem['priority'], string> = {
  urgent: 'Needs attention',
  watch: 'Worth watching',
  info: 'Good news',
};

export interface DigestEmailOptions {
  appUrl: string;
  username?: string;
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
  highlights: WeeklyAlertItem[];
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Top alerts, one per repo, capped at MAX_HIGHLIGHTS. Digest alerts are already priority-sorted. */
export function pickHighlights(digest: WeeklyAlertDigest): WeeklyAlertItem[] {
  const seen = new Set<number>();
  const highlights: WeeklyAlertItem[] = [];
  for (const alert of digest.alerts) {
    if (seen.has(alert.repoId)) continue;
    seen.add(alert.repoId);
    highlights.push(alert);
    if (highlights.length >= MAX_HIGHLIGHTS) break;
  }
  return highlights;
}

function appLink(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/$/, '')}${path}`;
}

/**
 * Render the weekly digest email. Returns null when there is nothing worth
 * sending (no alerts survived the user's lane rules) — callers skip the send.
 */
export function buildWeeklyDigestEmail(
  digest: WeeklyAlertDigest,
  options: DigestEmailOptions
): DigestEmail | null {
  const highlights = pickHighlights(digest);
  if (highlights.length === 0) return null;

  const weekOf = digest.generatedAt.slice(0, 10);
  const subject = `Starboard weekly digest — ${highlights.length} repo${highlights.length === 1 ? '' : 's'} worth a look (${weekOf})`;

  const inboxUrl = appLink(options.appUrl, '/radar');
  const greeting = options.username ? `Hi ${options.username},` : 'Hi,';

  const textLines = [
    greeting,
    '',
    `Here is your Starboard weekly digest for ${weekOf} — ${digest.summary.totalAlerts} signal${digest.summary.totalAlerts === 1 ? '' : 's'} across your starred repos.`,
    '',
    ...highlights.flatMap((alert) => [
      `* ${alert.fullName} [${LANE_LABELS[alert.lane]} — ${PRIORITY_LABELS[alert.priority]}]`,
      `  Why it matters: ${alert.detail}`,
      `  Open in Starboard: ${appLink(options.appUrl, alert.starboardUrl)}`,
      '',
    ]),
    `Full inbox and radar: ${inboxUrl}`,
    `Manage alert emails (opt out any time): ${inboxUrl}`,
  ];

  const htmlHighlights = highlights
    .map(
      (alert) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
          <a href="${escapeHtml(appLink(options.appUrl, alert.starboardUrl))}" style="font-size:15px;font-weight:600;color:#4f46e5;text-decoration:none;">${escapeHtml(alert.fullName)}</a>
          <span style="font-size:11px;color:#6b7280;border:1px solid #d1d5db;border-radius:9999px;padding:1px 8px;margin-left:8px;">${LANE_LABELS[alert.lane]} &middot; ${PRIORITY_LABELS[alert.priority]}</span>
          <div style="font-size:13px;color:#374151;margin-top:4px;">${escapeHtml(alert.detail)}</div>
          <div style="font-size:12px;margin-top:4px;">
            <a href="${escapeHtml(appLink(options.appUrl, alert.starboardUrl))}" style="color:#4f46e5;">View in Starboard</a>
            &nbsp;&middot;&nbsp;
            <a href="${escapeHtml(alert.sourceUrl)}" style="color:#6b7280;">GitHub</a>
          </div>
        </td>
      </tr>`
    )
    .join('');

  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#111827;">
    <h1 style="font-size:18px;margin:0 0 4px;">Starboard weekly digest</h1>
    <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">Week of ${escapeHtml(weekOf)} &middot; ${digest.summary.totalAlerts} signal${digest.summary.totalAlerts === 1 ? '' : 's'} (${digest.summary.release} release / ${digest.summary.momentum} momentum / ${digest.summary.maintenance} maintenance)</p>
    <p style="font-size:14px;margin:0 0 8px;">${escapeHtml(greeting)} the repos below moved this week and match your alert lanes.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlHighlights}
    </table>
    <p style="font-size:13px;margin:20px 0 0;">
      <a href="${escapeHtml(inboxUrl)}" style="color:#4f46e5;font-weight:600;">Open your full inbox on Starboard →</a>
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:16px 0 0;">
      You get this because weekly digest is enabled in your Starboard alert settings.
      <a href="${escapeHtml(inboxUrl)}" style="color:#9ca3af;">Manage preferences or opt out</a>.
    </p>
  </div>`;

  return { subject, html, text: textLines.join('\n'), highlights };
}
