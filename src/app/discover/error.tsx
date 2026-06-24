'use client';

import { useEffect } from 'react';

import { captureError } from '@/lib/foundry-monitoring';

export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    captureError(error, { scope: 'discover', digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-bold mb-3">Couldn&apos;t load Discover</h2>
        <p className="text-sm opacity-70 mb-6">
          Something went wrong while loading the discover feed — try again.
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
