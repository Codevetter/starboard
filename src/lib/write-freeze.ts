const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Paths that must stay writable even during a DB cutover freeze.
 * OAuth signup/sign-in (NextAuth) must never return write_frozen.
 */
const FREEZE_EXEMPT_PREFIXES = ['/api/auth'];

export function isWriteFreezeExempt(pathname: string): boolean {
  return FREEZE_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function shouldFreezeWrite(
  method: string,
  enabled: string | undefined,
  pathname?: string
): boolean {
  if (pathname && isWriteFreezeExempt(pathname)) return false;
  return enabled === 'true' && !SAFE_METHODS.has(method.toUpperCase());
}
