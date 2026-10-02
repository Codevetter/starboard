import { describe, expect, it, vi } from 'vitest';

import { embedViaBinding } from './embeddings';
import { SharedBudgetDeniedError, type SharedBudgetNamespace } from './shared-ai-budget';

describe('Workers AI embedding budget', () => {
  it('reserves each binding retry and stops before AI when a later reservation is denied', async () => {
    let reservations = 0;
    const namespace: SharedBudgetNamespace = {
      idFromName: vi.fn(() => 'global-budget'),
      get: vi.fn(() => ({
        fetch: vi.fn(async () => {
          reservations += 1;
          return Response.json({
            allowed: reservations === 1,
            used: reservations === 1 ? 1 : 0,
            remaining: reservations === 1 ? 9_499 : 9_500,
            retryAfter: reservations === 1 ? 0 : 1,
            dayKey: new Date().toISOString().slice(0, 10),
          });
        }),
      })),
    };
    const run = vi.fn(async () => {
      throw Object.assign(new Error('overloaded'), { status: 503 });
    });

    await expect(embedViaBinding({ run }, namespace, ['café'])).rejects.toBeInstanceOf(
      SharedBudgetDeniedError
    );
    expect(reservations).toBe(2);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
