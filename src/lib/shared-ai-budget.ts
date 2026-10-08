export interface SharedBudgetNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
}

export class SharedBudgetDeniedError extends Error {
  constructor(message = 'Shared AI budget is unavailable or exhausted.') {
    super(message);
    this.name = 'SharedBudgetDeniedError';
  }
}

const NEURON_CAP = 9_500;
const VECTORIZE_CAP = 45_000_000;
const INPUT_NEURONS_PER_MILLION: Record<string, number> = {
  '@cf/baai/bge-base-en-v1.5': 6_058,
};

function deny(): never {
  throw new SharedBudgetDeniedError();
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function namespaceStub(namespace: SharedBudgetNamespace) {
  return namespace.get(namespace.idFromName('global-budget'));
}

async function reserve(
  namespace: SharedBudgetNamespace,
  path: string,
  body: Record<string, number>
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await namespaceStub(namespace).fetch(`https://internal.local/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return deny();
  }
  if (response.status !== 200) return deny();
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return deny();
    return payload as Record<string, unknown>;
  } catch {
    return deny();
  }
}

export function estimateWorkersAiNeurons(model: string, input: unknown): number {
  const rate = INPUT_NEURONS_PER_MILLION[model];
  if (!rate) return 0;
  const serializedBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  return Math.max(1, Math.ceil((Math.ceil(serializedBytes * 1.2) * rate) / 1_000_000));
}

export async function reserveWorkersAiCall(
  namespace: SharedBudgetNamespace,
  model: string,
  input: unknown
): Promise<void> {
  const neurons = estimateWorkersAiNeurons(model, input);
  if (!Number.isSafeInteger(neurons) || neurons <= 0 || neurons > NEURON_CAP) return deny();
  const receipt = await reserve(namespace, 'try-debit', { neurons });
  if (
    receipt.allowed !== true ||
    receipt.dayKey !== new Date().toISOString().slice(0, 10) ||
    receipt.retryAfter !== 0 ||
    !safeInteger(receipt.used) ||
    receipt.used < neurons ||
    !safeInteger(receipt.remaining) ||
    receipt.used + receipt.remaining !== NEURON_CAP
  )
    return deny();
}

export async function reserveVectorizeQuery(
  namespace: SharedBudgetNamespace,
  dimensions: number
): Promise<void> {
  if (!Number.isSafeInteger(dimensions) || dimensions <= 0 || dimensions > VECTORIZE_CAP)
    return deny();
  const receipt = await reserve(namespace, 'try-debit-vectorize', { dimensions });
  validateVectorizeReceipt(receipt, dimensions);
}

function validateVectorizeReceipt(receipt: Record<string, unknown>, dimensions: number): void {
  if (
    receipt.allowed !== true ||
    receipt.monthKey !== new Date().toISOString().slice(0, 7) ||
    receipt.baselineVerified !== true ||
    receipt.retryAfter !== 0 ||
    !safeInteger(receipt.used) ||
    receipt.used < dimensions ||
    !safeInteger(receipt.remaining) ||
    receipt.used + receipt.remaining !== VECTORIZE_CAP
  )
    deny();
}

export async function reserveVectorizeStorage(
  namespace: SharedBudgetNamespace,
  dimensions: number
): Promise<void> {
  if (!Number.isSafeInteger(dimensions) || dimensions <= 0 || dimensions > VECTORIZE_CAP)
    return deny();
  const receipt = await reserve(namespace, 'try-debit-vectorize-storage', { dimensions });
  validateVectorizeReceipt(receipt, dimensions);
  if (
    receipt.storedCap !== 200_000_000 ||
    !safeInteger(receipt.storedUsed) ||
    receipt.storedUsed < dimensions ||
    !safeInteger(receipt.storedRemaining) ||
    receipt.storedUsed + receipt.storedRemaining !== receipt.storedCap
  )
    return deny();
}

export function denyVectorizeStorageGrowth(): void {
  throw new SharedBudgetDeniedError(
    'Vectorize storage growth is disabled until verified storage headroom is available.'
  );
}

export async function runOnlyIfVectorizeStorageGrowthAllowed<T>(
  work: () => Promise<T>
): Promise<T> {
  denyVectorizeStorageGrowth();
  return work();
}
