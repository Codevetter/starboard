import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('authenticated session cache isolation', () => {
  it('does not use the fully-static incremental cache for the dynamic application', () => {
    const openNextConfig = source('open-next.config.ts');

    expect(openNextConfig).not.toContain('staticAssetsIncrementalCache');
    expect(openNextConfig).toContain('defineCloudflareConfig({})');
  });

  it('does not serialize a server session through the root client provider', () => {
    const rootLayout = source('src/app/layout.tsx');
    const providers = source('src/components/providers.tsx');

    expect(rootLayout).not.toContain("import { auth } from '@/lib/auth'");
    expect(rootLayout).not.toContain('session={session}');
    expect(providers).not.toContain('session?: Session');
    expect(providers).toContain('<SessionProvider');
  });

  it('marks login and authenticated product pages private and non-cacheable', () => {
    const nextConfig = source('next.config.ts');

    expect(nextConfig).toContain("value: 'private, no-store, max-age=0'");
    expect(nextConfig).toContain("source: '/login'");
    expect(nextConfig).toContain("source: '/projects'");
    expect(nextConfig).toContain("source: '/stars'");
  });
});
