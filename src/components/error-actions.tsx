/**
 * Shared error-recovery actions rendered by the per-route `error.tsx`
 * boundaries. The "Try again" + "Home" button row and optional digest
 * reference are identical across every error surface.
 */
export function ErrorActions({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
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
    </>
  );
}
