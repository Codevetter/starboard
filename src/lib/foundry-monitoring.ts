'use client';

import posthog from 'posthog-js';

type AuthFailureStage = 'signin' | 'signup' | 'callback' | 'session' | 'unknown';
const PROJECT_SLUG = 'starboard';
const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? 'phc_qgiAarw4Co4pw9fz3Fxj4UJaHmqzFetqs4JrXhGc35Nd';
const POSTHOG_HOST = 'https://us.i.posthog.com';

function route() {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

function messageFrom(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

export function captureAuthFailure(options: {
  provider?: string;
  stage?: AuthFailureStage;
  reason?: string;
  source?: string;
}) {
  posthog.capture('foundry_auth_failure', {
    project_id: PROJECT_SLUG,
    route: route(),
    provider: options.provider,
    stage: options.stage ?? 'unknown',
    reason: options.reason,
    source: options.source,
  });
}

type ErrorBoundaryScope = 'root' | 'global' | 'stars' | 'discover' | 'explore' | 'unknown';

/**
 * Emits an "error_captured" event for an error surfaced by a React error
 * boundary (error.tsx / global-error.tsx). Use alongside captureAuthFailure().
 * Safe to call from the client — no-ops gracefully if PostHog is not ready.
 */
export function captureError(
  error: unknown,
  options: { scope?: ErrorBoundaryScope; digest?: string; source?: string } = {}
) {
  try {
    posthog.capture('error_captured', {
      project_id: PROJECT_SLUG,
      route: route(),
      scope: options.scope ?? 'unknown',
      digest: options.digest,
      source: options.source ?? 'error_boundary',
      message: messageFrom(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } catch {
    // Never let monitoring throw inside an error boundary.
  }
}

export function capturePageCrash(error: unknown, source: 'window_error' | 'unhandled_rejection') {
  posthog.capture('foundry_page_crash', {
    project_id: PROJECT_SLUG,
    route: route(),
    source,
    message: messageFrom(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function installBrowserMonitoring() {
  if (typeof window === 'undefined') return () => {};
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'always',
    capture_pageview: false,
    autocapture: false,
  });

  const onError = (event: ErrorEvent) =>
    capturePageCrash(event.error ?? event.message, 'window_error');
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    capturePageCrash(event.reason, 'unhandled_rejection');

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
