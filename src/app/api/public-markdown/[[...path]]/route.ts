import { publicMarkdown } from '@/lib/public-markdown';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (
    new URL(request.url).search ||
    ['cookie', 'authorization', 'cf-access-jwt-assertion', 'rsc', 'next-router-state-tree'].some(
      (key) => request.headers.has(key)
    )
  )
    return Response.json({ error: 'Public source only' }, { status: 404, headers });
  try {
    const { path } = await params;
    const document = await publicMarkdown(`/${(path ?? []).join('/')}`);
    return Response.json(document ?? { error: 'Not found' }, {
      status: document ? 200 : 404,
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('NEXT_HTTP_ERROR_FALLBACK;404'))
      return Response.json({ error: 'Not found' }, { status: 404, headers });
    console.error('[public-markdown] source renderer failed', error);
    return Response.json({ error: 'Public source unavailable' }, { status: 503, headers });
  }
}
