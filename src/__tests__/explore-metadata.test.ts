import { describe, expect, it } from 'vitest';
import { generateMetadata } from '../app/explore/[...slug]/layout';

describe('public repository metadata', () => {
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
