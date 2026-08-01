import type { DbClient, DbResult, InStatement, InValue } from './client';

interface D1ApiMeta {
  changes?: number;
  last_row_id?: number;
}

interface D1ApiQueryResult {
  success?: boolean;
  results?: Record<string, unknown>[];
  meta?: D1ApiMeta;
}

interface D1ApiResponse {
  success: boolean;
  result?: D1ApiQueryResult[];
  errors?: Array<{ message?: string }>;
}

interface D1RestConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}

function normalizeValue(value: InValue): string | number | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof ArrayBuffer) {
    throw new Error('D1 REST operator queries do not accept ArrayBuffer parameters');
  }
  return value;
}

function normalizeResult(result: D1ApiQueryResult): DbResult {
  if (result.success === false) throw new Error('D1 query failed');
  const rows = result.results ?? [];
  return {
    rows,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    rowsAffected: result.meta?.changes ?? 0,
    lastInsertRowid: result.meta?.last_row_id ?? null,
  };
}

export function createD1RestClient(config: D1RestConfig): DbClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  async function request(statements: InStatement[]): Promise<DbResult[]> {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        statements.length === 1
          ? {
              sql: statements[0].sql,
              params: (statements[0].args ?? []).map(normalizeValue),
            }
          : {
              batch: statements.map((statement) => ({
                sql: statement.sql,
                params: (statement.args ?? []).map(normalizeValue),
              })),
            }
      ),
    });
    const payload = (await response.json()) as D1ApiResponse;
    if (!response.ok || !payload.success || !payload.result) {
      const message = payload.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join('; ');
      throw new Error(message || `D1 API request failed with status ${response.status}`);
    }
    return payload.result.map(normalizeResult);
  }

  return {
    async execute(statement) {
      const [result] = await request([
        typeof statement === 'string' ? { sql: statement } : statement,
      ]);
      if (!result) throw new Error('D1 API returned no query result');
      return result;
    },
    batch(statements) {
      return request(statements);
    },
  };
}

export function createD1RestClientFromEnv(): DbClient {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN are required');
  }
  return createD1RestClient({ accountId, databaseId, apiToken });
}
