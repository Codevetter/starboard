import {
  getPublicRepositorySlice,
  REPOSITORY_SITEMAP_COUNT,
  REPOSITORY_SITEMAP_SIZE,
} from '@/lib/public-repository-catalog';
import { repositorySitemapXml, XML_HEADERS } from '@/lib/repository-sitemap';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ chunk: string }> }) {
  const { chunk } = await params;
  if (
    !/^(0|[1-9]\d{0,4})\.xml$/.test(chunk) ||
    Number(chunk.slice(0, -4)) >= REPOSITORY_SITEMAP_COUNT
  ) {
    return new Response('Sitemap not found', { status: 404 });
  }
  const repos = await getPublicRepositorySlice(
    Number(chunk.slice(0, -4)) * REPOSITORY_SITEMAP_SIZE,
    REPOSITORY_SITEMAP_SIZE
  );
  return new Response(repositorySitemapXml(repos), { headers: XML_HEADERS });
}
