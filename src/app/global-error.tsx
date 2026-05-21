"use client";

import { useEffect } from "react";

import { captureError } from "@/lib/foundry-monitoring";

/**
 * Catches failures in the root layout itself (where `error.tsx` cannot run).
 * It must render its own <html>/<body> and cannot rely on app styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    captureError(error, { scope: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0a0a0a",
          color: "#ededed",
          padding: "2rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 12 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: "0.875rem", opacity: 0.7, marginBottom: 24 }}>
            The app failed to load. Please reload the page — if it keeps
            happening, try again in a few minutes.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: 6,
              border: "1px solid #333",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: 24, fontSize: "0.75rem", opacity: 0.4 }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
