import { type NextRequest, NextResponse } from 'next/server';

import { shouldFreezeWrite } from '@/lib/write-freeze';

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
