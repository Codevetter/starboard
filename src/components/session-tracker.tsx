'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';

import { trackReturned, trackSignup } from '@/lib/analytics';

/**
 * Owner-facing analytics — emits `signup` and `returned`.
 *
 * `signup` fires once, the first time a given user is ever seen in this
 * browser. `returned` fires on every subsequent authenticated session start
 * for a user who has prior activity. This powers the PostHog
 * signup -> activated -> core_action funnel and the D1/D7 retention insight.
 *
 * Renders nothing.
 */
export function SessionTracker() {
  const { data: session, status } = useSession();
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const userId = session?.user?.githubId;
    if (!userId || firedFor.current === userId) return;
    firedFor.current = userId;

    try {
      const key = `starboard:seen:${userId}`;
      if (typeof window !== 'undefined' && window.localStorage.getItem(key)) {
        // The user has been seen in this browser before — a return session.
        trackReturned();
      } else {
        // First time this user is seen here — treat as signup.
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, String(Date.now()));
        }
        trackSignup();
      }
    } catch {
      // localStorage may be unavailable — never break on analytics.
    }
  }, [session, status]);

  return null;
}
