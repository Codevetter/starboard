export function canonicalPath(pathname: string): string {
  const extensionless = pathname.replace(/\.html$/, '');
  return extensionless === '/index' ? '/' : extensionless;
}
