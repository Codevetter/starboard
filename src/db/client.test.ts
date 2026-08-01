import { describe, expect, it } from 'vitest';

import { createD1Client, type D1DatabaseLike } from './client';

function fakeDatabase(results: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const database: D1DatabaseLike = {
    prepare(sql) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          return statement;
        },
        async all() {
          calls.push({ sql, args });
          return { success: true, results, meta: { changes: 2, last_row_id: 9 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.all()));
    },
  };
  return { database, calls };
}

describe('D1 client adapter', () => {
  it('preserves the result shape and normalizes bound values', async () => {
    const { database, calls } = fakeDatabase([{ id: 1, name: 'one' }]);
    const client = createD1Client(database);

    const result = await client.execute({
      sql: 'SELECT * FROM repos WHERE archived = ? AND id = ?',
      args: [false, BigInt(1)],
    });

    expect(calls).toEqual([
      { sql: 'SELECT * FROM repos WHERE archived = ? AND id = ?', args: [0, 1] },
    ]);
    expect(result).toEqual({
      rows: [{ id: 1, name: 'one' }],
      columns: ['id', 'name'],
      rowsAffected: 2,
      lastInsertRowid: 9,
    });
  });

  it('runs prepared statements through D1 batch', async () => {
    const { database, calls } = fakeDatabase([]);
    const client = createD1Client(database);

    const results = await client.batch([
      { sql: 'INSERT INTO repos (id) VALUES (?)', args: [1] },
      { sql: 'INSERT INTO repos (id) VALUES (?)', args: [2] },
    ]);

    expect(calls.map((call) => call.args)).toEqual([[1], [2]]);
    expect(results).toHaveLength(2);
  });

  it('fails closed when D1 reports an unsuccessful query', async () => {
    const database: D1DatabaseLike = {
      prepare() {
        const statement = {
          bind() {
            return statement;
          },
          async all() {
            return { success: false, error: 'no such table' };
          },
        };
        return statement;
      },
      async batch() {
        return [];
      },
    };

    await expect(createD1Client(database).execute('SELECT 1')).rejects.toThrow('no such table');
  });
});
