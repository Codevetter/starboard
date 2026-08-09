'use client';

import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { SWRConfig } from 'swr';

import { initApiTiming } from '@/lib/api-timing';
import { installBrowserMonitoring } from '@/lib/foundry-monitoring';
import { swrErrorRetry } from '@/lib/swr-fetcher';
import { initVitals } from '@/lib/vitals';

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  /** Server-fetched session so first paint does not wait on /api/auth/session. */
  session?: Session | null;
}) {
  useEffect(() => {
    const uninstallBrowserMonitoring = installBrowserMonitoring();
    initVitals();
    initApiTiming();
    return uninstallBrowserMonitoring;
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
          <SWRConfig
            value={{
              // Avoid focus thrash + CF edge 429s during ordinary browsing.
              revalidateOnFocus: false,
              dedupingInterval: 5_000,
              errorRetryCount: 3,
              onErrorRetry: swrErrorRetry,
              shouldRetryOnError: true,
            }}
          >
            <NuqsAdapter>{children}</NuqsAdapter>
          </SWRConfig>
        </SessionProvider>
      </ThemeProvider>
    </PostHogProvider>
  );
}
