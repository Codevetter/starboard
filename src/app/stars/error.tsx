'use client';

import { useEffect } from 'react';

import { ErrorActions } from '@/components/error-actions';
import { captureError } from '@/lib/foundry-monitoring';

export default function StarsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    captureError(error, { scope: 'stars', digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-bold mb-3">Couldn&apos;t load your stars</h2>
        <p className="text-sm opacity-70 mb-6">
          Something went wrong while loading your starred repos. Your data is safe — try again.
        </p>
        <ErrorActions error={error} reset={reset} />
      </div>
    </div>
  );
}
