'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { usePathname } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { SWRConfig } from 'swr';

import { initApiTiming } from '@/lib/api-timing';
import { trackPageView } from '@/lib/analytics';
import { installBrowserMonitoring } from '@/lib/foundry-monitoring';
import { swrErrorRetry } from '@/lib/swr-fetcher';
import { initVitals } from '@/lib/vitals';

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const uninstallBrowserMonitoring = installBrowserMonitoring();
    initVitals();
    initApiTiming();
    return uninstallBrowserMonitoring;
  }, []);

  // Manually emit `page_view` on mount and on every route change. PostHog's
  // built-in $pageview capture is disabled so this carries `project_id`.
  useEffect(() => {
    trackPageView();
  }, [pathname]);

  return (
    <PostHogProvider client={posthog}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <SessionProvider
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
