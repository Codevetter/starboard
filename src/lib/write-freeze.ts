const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function shouldFreezeWrite(method: string, enabled: string | undefined): boolean {
  return enabled === 'true' && !SAFE_METHODS.has(method.toUpperCase());
}
