/**
 * Tests for the refresh-lifecycle manifest quality gate.
 *
 * Covers the `data-research-toolbox-automation` requirement: a refresh that
 * exits successfully with zero output where non-zero is expected fails
 * quality verification rather than advancing freshness.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_RETRIES,
  MANIFEST_PATH,
  recordStep,
  readManifest,
  withRetry,
  type RefreshManifestState,
} from '@/lib/refresh-manifest';

// The module writes to `data/refresh-manifest.json` (gitignored). Tests
// exercise the public API and reset the file between cases. The file is
// operator-local state; CI runners start with no manifest.
const TMP = mkdtempSync(join(tmpdir(), 'starboard-rm-'));

beforeEach(() => {
  // Reset the manifest to an empty state before each test.
  try {
    writeFileSync(MANIFEST_PATH, JSON.stringify({ runs: {}, last_failure: null }));
  } catch {
    // If the path isn't writable, readManifest returns empty state.
  }
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('refresh-manifest recordStep', () => {
  it('advances freshness on a successful non-zero-output run', () => {
    const rec = recordStep({
      step: 'seed_walk',
      sourceWatermark: 'cursor_after_walk',
      bounds: { page_limit: 120 },
      timeoutS: 3600,
      idempotency: 'upsert',
      outputCount: 312,
      expectedMinOutput: 1,
    });
    expect(rec.quality_failed).toBe(false);
    expect(rec.error).toBeNull();
    expect(rec.freshness.wall_clock).not.toBeNull();
  });

  it('marks zero output as quality_failed and does NOT advance freshness', () => {
    // Establish a baseline successful run.
    recordStep({
      step: 'seed_embed',
      sourceWatermark: null,
      bounds: { daily_limit: 1000 },
      timeoutS: 1800,
      idempotency: 'upsert',
      outputCount: 500,
      expectedMinOutput: 1,
    });
    const first = readManifest().runs.seed_embed!;
    const firstWall = first.freshness.wall_clock;
    expect(firstWall).not.toBeNull();

    // Now a "successful" run with zero output where 1 was expected.
    recordStep({
      step: 'seed_embed',
      sourceWatermark: null,
      bounds: { daily_limit: 1000 },
      timeoutS: 1800,
      idempotency: 'upsert',
      outputCount: 0,
      expectedMinOutput: 1,
    });
    const second = readManifest().runs.seed_embed!;
    expect(second.quality_failed).toBe(true);
    expect(second.freshness.wall_clock).toBe(firstWall);

    const failure = readManifest().last_failure;
    expect(failure?.step).toBe('seed_embed');
    expect(failure?.unresolved).toBe(true);
    expect(failure?.error).toContain('quality_failed');
  });

  it('clears last_failure when the failing step next succeeds', () => {
    recordStep({
      step: 'seed_walk',
      sourceWatermark: null,
      bounds: {},
      timeoutS: 60,
      idempotency: 'upsert',
      outputCount: 0,
      expectedMinOutput: 1,
    });
    expect(readManifest().last_failure?.step).toBe('seed_walk');

    recordStep({
      step: 'seed_walk',
      sourceWatermark: null,
      bounds: {},
      timeoutS: 60,
      idempotency: 'upsert',
      outputCount: 42,
      expectedMinOutput: 1,
    });
    expect(readManifest().last_failure).toBeNull();
  });

  it('records the error and retry count after exhausting attempts', async () => {
    async function boom(): Promise<[number, string | null]> {
      throw new Error('upstream 503');
    }
    const rec = await withRetry('seed_embed', boom, {
      sourceWatermark: null,
      bounds: { daily_limit: 1000 },
      timeoutS: 1800,
      idempotency: 'upsert',
      expectedMinOutput: 1,
    });
    expect(rec.error).toContain('upstream 503');
    expect(rec.retries.used).toBe(DEFAULT_RETRIES.maxAttempts);
    expect(rec.quality_failed).toBe(false); // error path, not quality path
    expect(readManifest().last_failure?.step).toBe('seed_embed');
  });

  it('readManifest returns the current state', () => {
    recordStep({
      step: 'seed_pool_coverage',
      sourceWatermark: null,
      bounds: { min_stars_floor: 5000 },
      timeoutS: 60,
      idempotency: 'read-only',
      outputCount: 4321,
      expectedMinOutput: 0,
    });
    const state: RefreshManifestState = readManifest();
    expect(state.runs.seed_pool_coverage).toBeDefined();
    expect(state.last_failure).toBeNull();
  });
});
