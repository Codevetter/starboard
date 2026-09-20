import type { APIRoute, GetStaticPaths } from 'astro';

const articles = import.meta.glob('./*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// Per-article Markdown mirror. The published .md source already has the
// working sections stripped by scripts/sync-articles.mjs; we only drop the
// frontmatter block.
export const getStaticPaths: GetStaticPaths = () =>
  Object.entries(articles).map(([file, raw]) => {
    const slug = file.replace(/^\.\//, '').replace(/\.md$/, '');
    const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
    return { params: { slug }, props: { body } };
  });

export const GET: APIRoute = ({ props }) =>
  new Response((props as { body: string }).body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
