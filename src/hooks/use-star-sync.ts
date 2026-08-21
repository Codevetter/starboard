'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';

import type { SyncResult } from './use-starred-repos';

interface UseStarSyncOptions {
  mutate: () => Promise<unknown>;
  onSyncComplete: () => void;
}

export function useStarSync({ mutate, onSyncComplete }: UseStarSyncOptions) {
  const { mutate: globalMutate } = useSWRConfig();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const sync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch('/api/stars/sync', { method: 'POST' });
      if (!res.ok) {
        // Surface a clear, user-facing message instead of letting an error
        // body ({ error }) be treated as a successful SyncResult.
        const message =
          res.status === 401
            ? 'Sign in with GitHub again to sync your stars.'
            : "Couldn't sync your GitHub stars. Try again in a moment.";
        setSyncError(message);
        return null;
      }
      const result: SyncResult = await res.json();
      setSyncResult(result);
      onSyncComplete();
      await Promise.all([mutate(), globalMutate('/api/lists')]);
      // Auto-generate embeddings for all repos missing them
      fetch('/api/embeddings/generate', { method: 'POST' }).catch(() => {});
      return result;
    } catch (err) {
      console.error('Star sync failed', err);
      setSyncError(
        "Couldn't reach GitHub to sync your stars. Check your connection and try again."
      );
      return null;
    } finally {
      setSyncing(false);
    }
  };

  const dismissSyncResult = () => setSyncResult(null);
  const dismissSyncError = () => setSyncError(null);

  return { syncing, sync, syncResult, syncError, dismissSyncResult, dismissSyncError };
}
