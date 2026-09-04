import { type NextRequest, NextResponse } from 'next/server';

import { shouldBlockScraper } from '@/lib/bot-guard';
import { shouldFreezeWrite } from '@/lib/write-freeze';

// Keep the Edge middleware convention until @opennextjs/cloudflare supports
// Next 16's Node-only proxy.ts output. Migrating mechanically makes build:cf
// fail before bundling, so the deprecation warning is currently intentional.
export function middleware(request: NextRequest) {
  if (shouldBlockScraper(request.nextUrl.pathname, request.headers.get('user-agent'))) {
    return new NextResponse('Automated clients are not permitted on this route.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (!shouldFreezeWrite(request.method, process.env.WRITE_FREEZE, request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      error: 'Writes are briefly paused while database maintenance completes.',
      code: 'write_frozen',
    },
    { status: 503, headers: { 'Retry-After': '60' } }
  );
}

export const config = {
  matcher: ['/api/:path*', '/explore/:path*'],
};
