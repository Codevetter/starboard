import { type NextRequest, NextResponse } from 'next/server';

import { shouldFreezeWrite } from '@/lib/write-freeze';

// Keep the Edge middleware convention until @opennextjs/cloudflare supports
// Next 16's Node-only proxy.ts output. Migrating mechanically makes build:cf
// fail before bundling, so the deprecation warning is currently intentional.
export function middleware(request: NextRequest) {
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
  matcher: '/api/:path*',
};
