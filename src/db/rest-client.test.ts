import { describe, expect, it, vi } from 'vitest';

import { createD1RestClient } from './rest-client';

describe('D1 REST operator client', () => {
  it('uses the authenticated Cloudflare endpoint and preserves result shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        result: [
          {
            success: true,
            results: [{ id: 7 }],
            meta: { changes: 1, last_row_id: 7 },
          },
        ],
      })
    );
    const client = createD1RestClient({
      accountId: 'account',
      databaseId: 'database',
      apiToken: 'token',
      fetchImpl,
    });

    await expect(
      client.execute({ sql: 'SELECT id FROM repos WHERE archived = ?', args: [false] })
    ).resolves.toEqual({
      rows: [{ id: 7 }],
      columns: ['id'],
      rowsAffected: 1,
      lastInsertRowid: 7,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account/d1/database/database/query',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: 'SELECT id FROM repos WHERE archived = ?',
          params: [0],
        }),
      })
    );
  });

  it('fails closed on Cloudflare API errors', async () => {
    const client = createD1RestClient({
      accountId: 'account',
      databaseId: 'database',
      apiToken: 'token',
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          Response.json({ success: false, errors: [{ message: 'forbidden' }] }, { status: 403 })
        ),
    });

    await expect(client.execute('SELECT 1')).rejects.toThrow('forbidden');
  });
});
