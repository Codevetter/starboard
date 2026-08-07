'use client';

import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';

import { installBrowserMonitoring } from '@/lib/foundry-monitoring';

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  /** Server-fetched session so first paint does not wait on /api/auth/session. */
  session?: Session | null;
}) {
  useEffect(() => {
    return installBrowserMonitoring();
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <SessionProvider
          session={session}
          refetchOnWindowFocus={false}
          refetchInterval={0}
          refetchWhenOffline={false}
        >
          <NuqsAdapter>{children}</NuqsAdapter>
        </SessionProvider>
      </ThemeProvider>
    </PostHogProvider>
  );
}
