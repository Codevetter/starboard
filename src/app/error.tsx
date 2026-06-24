'use client';

import { useEffect } from 'react';

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
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="px-4 py-2 rounded border hover:opacity-80">
            Try again
          </button>
          <button
            onClick={() => window.location.replace('/')}
            className="px-4 py-2 rounded border hover:opacity-80"
          >
            Home
          </button>
        </div>
        {error.digest ? <p className="mt-6 text-xs opacity-40">Reference: {error.digest}</p> : null}
      </div>
    </div>
  );
}
