import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('@/db', () => ({ db: { execute: mocks.execute } }));

import { resolveRepo } from './resolve';

const cachedRow = {
  id: 123,
  full_name: 'fleet/example',
  description: 'Cached public details',
};

describe('resolveRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ rows: [cachedRow] });
  });

  it('loads the cached public row in one D1 roundtrip', async () => {
    await expect(resolveRepo('fleet', 'example')).resolves.toEqual({
      id: 123,
      cachedResult: { rows: [cachedRow] },
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith({
      sql: 'SELECT * FROM repos WHERE full_name = ? COLLATE NOCASE',
      args: ['fleet/example'],
    });
  });
});
