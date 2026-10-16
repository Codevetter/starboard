export interface KnowledgeOperation {
  input: string;
  action: string;
  output: string;
  method: string;
  constraints: string[];
  importance: 'core' | 'supporting';
}

// These are exclusion checks for explicit inverse transformations, not a
// usefulness score. A shared format alone does not establish a shared action.
export function contradictsOperationDirection(action: string, evidence: string): boolean {
  const pairs = [
    [
      /\b(?:serializ\w*|stringif\w*|encod\w*|to_string)\b/i,
      /\b(?:deserializ\w*|pars(?:e|es|ed|ing)|decod\w*|from_str)\b/i,
    ],
    [/\bencrypt\w*\b/i, /\bdecrypt\w*\b/i],
    [/\bcompress\w*\b/i, /\bdecompress\w*\b/i],
  ];
  return pairs.some(([forward, reverse]) => {
    const requestedForward = forward.test(action);
    const requestedReverse = reverse.test(action);
    if (requestedForward === requestedReverse) return false;
    return requestedForward
      ? reverse.test(evidence) && !forward.test(evidence)
      : forward.test(evidence) && !reverse.test(evidence);
  });
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
