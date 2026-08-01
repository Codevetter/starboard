export type InValue = string | number | bigint | boolean | null | ArrayBuffer;

export interface InStatement {
  sql: string;
  args?: InValue[];
}

export interface DbResult {
  rows: Record<string, unknown>[];
  columns: string[];
  rowsAffected: number;
  lastInsertRowid: number | null;
}

export interface DbClient {
  execute(statement: string | InStatement): Promise<DbResult>;
  batch(statements: InStatement[]): Promise<DbResult[]>;
}

interface D1Meta {
  changes?: number;
  last_row_id?: number;
}

interface D1Result {
  success: boolean;
  results?: Record<string, unknown>[];
  meta?: D1Meta;
  error?: string;
}

interface D1PreparedStatementLike {
  bind(...values: Array<string | number | null | ArrayBuffer>): D1PreparedStatementLike;
  all(): Promise<D1Result>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<D1Result[]>;
}

function normalizeValue(value: InValue): string | number | null | ArrayBuffer {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(value);
  return value;
}

function prepare(database: D1DatabaseLike, statement: string | InStatement) {
  const sql = typeof statement === 'string' ? statement : statement.sql;
  const args = typeof statement === 'string' ? [] : (statement.args ?? []);
  return database.prepare(sql).bind(...args.map(normalizeValue));
}

function normalizeResult(result: D1Result): DbResult {
  if (!result.success) {
    throw new Error(result.error || 'D1 query failed');
  }
  const rows = result.results ?? [];
  return {
    rows,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    rowsAffected: result.meta?.changes ?? 0,
    lastInsertRowid: result.meta?.last_row_id ?? null,
  };
}

/**
 * Preserve Starboard's small libSQL-shaped surface while moving the actual
 * runtime boundary to Cloudflare D1. Domain code only relies on execute(),
 * batch(), rows, rowsAffected, columns, and lastInsertRowid.
 */
export function createD1Client(database: D1DatabaseLike): DbClient {
  return {
    async execute(statement) {
      return normalizeResult(await prepare(database, statement).all());
    },
    async batch(statements) {
      const results = await database.batch(
        statements.map((statement) => prepare(database, statement))
      );
      return results.map(normalizeResult);
    },
  };
}
