export interface KnowledgeOperation {
  input: string;
  action: string;
  output: string;
  method: string;
  constraints: string[];
  importance: 'core' | 'supporting';
}

export function knowledgeOperation(value: unknown): KnowledgeOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid feature operation');
  const row = value as Record<string, unknown>;
  const text = (key: string, limit: number, empty = false) => {
    const value = row[key];
    if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > limit)
      throw new Error('Invalid feature operation');
    return value.trim();
  };
  if (
    !Array.isArray(row.constraints) ||
    row.constraints.length > 3 ||
    row.constraints.some(
      (value) => typeof value !== 'string' || !value.trim() || value.length > 100
    ) ||
    !['core', 'supporting'].includes(String(row.importance))
  )
    throw new Error('Invalid feature operation');
  return {
    input: text('input', 100),
    action: text('action', 100),
    output: text('output', 100),
    method: text('method', 140, true),
    constraints: row.constraints as string[],
    importance: row.importance as KnowledgeOperation['importance'],
  };
}
