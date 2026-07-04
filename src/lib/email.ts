/**
 * Transactional email adapter — Resend REST API via fetch (no SDK, no binding).
 *
 * Fail-closed by design: when RESEND_API_KEY is not configured the adapter
 * logs and reports a skip instead of throwing, so scheduled jobs stay green
 * until ops wires the secret.
 *
 * Setup (no secret values in the repo):
 *   gh secret set RESEND_API_KEY            # GitHub Actions (weekly digest job)
 *   wrangler secret put RESEND_API_KEY      # only if a Worker route ever sends mail
 * Optional sender override (verified Resend domain):
 *   DIGEST_EMAIL_FROM="Starboard <digest@yourdomain.com>"
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

/** Resend sandbox sender — only delivers to the account owner. Set DIGEST_EMAIL_FROM in prod. */
export const DEFAULT_FROM = 'Starboard <onboarding@resend.dev>';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  sent: boolean;
  skipped?: 'missing-api-key';
  id?: string;
  error?: string;
}

export interface EmailAdapterOptions {
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
}

export function isEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY);
}

export async function sendEmail(
  message: EmailMessage,
  options: EmailAdapterOptions = {}
): Promise<EmailSendResult> {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY is not set — skipping send (fail-closed)');
    return { sent: false, skipped: 'missing-api-key' };
  }

  const from = options.from ?? process.env.DIGEST_EMAIL_FROM ?? DEFAULT_FROM;
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { sent: false, error: `Resend ${response.status}: ${detail.slice(0, 300)}` };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: body.id };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
