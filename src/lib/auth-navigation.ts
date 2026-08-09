export const DEFAULT_AUTH_DESTINATION = '/discover';

export function resolveInternalCallbackUrl(value: string | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_AUTH_DESTINATION;
  }
  return value;
}
