/**
 * Owner-facing analytics — the shared fleet funnel plus narrow product events.
 *
 * Every project in the fleet emits these four funnel events — `signup`,
 * `activated`, `core_action`, `returned` — so a single PostHog project can
 * build one cross-fleet funnel (signup -> activated -> core_action) and a
 * D1/D7 retention insight, with no custom dashboard.
 *
 * Every event carries `project_id: "starboard"`. Browser events use
 * `posthog-js`; server-triggered events post directly to the PostHog capture
 * API so this module stays safe in both bundles.
 */

const PROJECT = 'starboard' as const;

// Shared with foundry-monitoring.ts — same PostHog project.
const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? 'phc_qgiAarw4Co4pw9fz3Fxj4UJaHmqzFetqs4JrXhGc35Nd';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

/**
 * The product-specific action behind a `core_action` event.
 * Starboard's core verbs: syncing your GitHub stars in, and organizing
 * them into collections.
 */
export type CoreAction = 'repos_synced' | 'list_created';
export type DigestItemAction = 'reviewed' | 'dismissed';

interface AnalyticsEventMap {
  /** First session after an account is created. */
  signup: { project_id: typeof PROJECT };
  /** The user reaches first real value — their first successful star sync. */
  activated: { project_id: typeof PROJECT };
  /** The thing the product exists to do. */
  core_action: { project_id: typeof PROJECT; action: CoreAction };
  /** A return session by a user with prior activity. */
  returned: { project_id: typeof PROJECT };
  /** The maintainer digest was rendered for the user. */
  digest_opened: { project_id: typeof PROJECT; digest_id: string; item_count: number };
  /** A digest item was reviewed or dismissed. */
  digest_item_actioned: {
    project_id: typeof PROJECT;
    digest_id: string;
    item_id: string;
    group: string;
    action: DigestItemAction;
  };
}

function emitServer(event: string, props: Record<string, unknown>, distinctId?: string): void {
  void fetch(`${POSTHOG_HOST}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      distinct_id: distinctId ?? `${PROJECT}-server`,
      properties: props,
    }),
  }).catch(() => {
    // Analytics must never block or break a server action.
  });
}

export function trackEvent(
  event: string,
  properties: Record<string, unknown> = {},
  distinctId?: string
): void {
  const payload = { project_id: PROJECT, ...properties };
  try {
    if (typeof window === 'undefined') {
      emitServer(event, payload, distinctId);
    } else {
      // Browser context. Load the browser client lazily so the React-dependent
      // `posthog-js` entry is never evaluated during SSR.
      void import('posthog-js')
        .then(({ default: posthog }) => {
          posthog.capture(event, payload);
        })
        .catch(() => {
          // Analytics must never break a user flow. Swallow and move on.
        });
    }
  } catch {
    // Analytics must never break a user flow. Swallow and move on.
  }
}

function emit<K extends keyof AnalyticsEventMap>(
  event: K,
  props: Omit<AnalyticsEventMap[K], 'project_id'>,
  distinctId?: string
): void {
  trackEvent(event, props, distinctId);
}

/** Fire once, on the first session after an account is created. */
export function trackSignup(): void {
  emit('signup', {});
}

/** Fire once, when the user first reaches real value (first star sync). */
export function trackActivated(distinctId?: string): void {
  emit('activated', {}, distinctId);
}

/** Fire on each completion of the core product action. */
export function trackCoreAction(action: CoreAction, distinctId?: string): void {
  emit('core_action', { action }, distinctId);
}

/** Fire on session start for a user who has prior activity. */
export function trackReturned(): void {
  emit('returned', {});
}

/** Fire when the weekly maintainer digest is opened. */
export function trackDigestOpened(digestId: string, itemCount: number): void {
  emit('digest_opened', { digest_id: digestId, item_count: itemCount });
}

/** Fire when a digest item is marked reviewed or dismissed. */
export function trackDigestItemActioned(
  digestId: string,
  itemId: string,
  group: string,
  action: DigestItemAction
): void {
  emit('digest_item_actioned', {
    digest_id: digestId,
    item_id: itemId,
    group,
    action,
  });
}
