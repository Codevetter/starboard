import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicRepo = vi.hoisted(() => vi.fn());
vi.mock('@/lib/public-repo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/public-repo')>()),
  getPublicRepo,
}));
import RepositoryLayout, { generateMetadata } from '../app/explore/[...slug]/layout';
import RepositoryPage from '../app/explore/[...slug]/page';

describe('public repository metadata', () => {
  beforeEach(() => {
    getPublicRepo.mockImplementation(async (fullName: string) => ({
      full_name: fullName,
      description: 'A public repository with useful evidence.',
    }));
  });

  it('terminates missing repository pages and layouts with a real not-found response', async () => {
    getPublicRepo.mockResolvedValue(null);
    const params = Promise.resolve({ slug: ['fleet', 'missing'] });
    await expect(RepositoryPage({ params })).rejects.toMatchObject({
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
    await expect(RepositoryLayout({ params, children: null })).rejects.toMatchObject({
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
  });

  it('does not invent an indexable identity for a missing repository', async () => {
    getPublicRepo.mockResolvedValueOnce(null);
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ['fleet', 'missing'] }),
    });
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.alternates?.canonical).toBeUndefined();
  });

  it('gives distinct repositories their own identity and self-canonical', async () => {
    const first = await generateMetadata({
      params: Promise.resolve({ slug: ['xlite-dev', 'LeetCUDA'] }),
    });
    const second = await generateMetadata({
      params: Promise.resolve({ slug: ['prasanthrangan', 'hyprdots'] }),
    });
    expect(first.title).toContain('xlite-dev/LeetCUDA');
    expect(second.title).toContain('prasanthrangan/hyprdots');
    expect(first.alternates?.canonical).toBe('/explore/xlite-dev/LeetCUDA');
    expect(second.alternates?.canonical).toBe('/explore/prasanthrangan/hyprdots');
    expect(first.openGraph?.url).toBe(first.alternates?.canonical);
    expect(first.description).toContain('xlite-dev/LeetCUDA');
  });

  it.each(
    [
      [],
      ['owner'],
      ['owner', 'repo', 'file.ts'],
      ['bad owner', 'repo'],
      ['owner', '..'],
      ['owner', 'repo?redirect=1'],
    ].map((slug) => ({ slug }))
  )('does not index malformed paths: $slug', async ({ slug }) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.alternates?.canonical).toBeUndefined();
  });
});
