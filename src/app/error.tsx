'use client';

import { useEffect } from 'react';

import { ErrorActions } from '@/components/error-actions';
import { captureError } from '@/lib/foundry-monitoring';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Full detail goes to the console + PostHog — never to the user.
    console.error(error);
    captureError(error, { scope: 'root', digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold mb-3">Something went wrong</h2>
        <p className="text-sm opacity-70 mb-6">
          An unexpected error occurred on our end. Your data is safe — try again, and if it keeps
          happening, come back in a few minutes.
        </p>
        <ErrorActions error={error} reset={reset} />
      </div>
    </div>
  );
}
