export const D1_MAX_BOUND_PARAMETERS = 100;

export function chunkForD1<T>(values: T[], reservedParameters = 0): T[][] {
  const size = D1_MAX_BOUND_PARAMETERS - reservedParameters;
  if (!Number.isInteger(reservedParameters) || reservedParameters < 0 || size < 1) {
    throw new Error('reservedParameters must leave at least one D1 bind parameter');
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
