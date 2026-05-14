"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold mb-3">Something went wrong</h2>
        <p className="text-sm opacity-70 mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded border hover:opacity-80"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.replace("/")}
            className="px-4 py-2 rounded border hover:opacity-80"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
