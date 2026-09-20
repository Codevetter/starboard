import type { APIRoute } from 'astro';

interface ArticleFrontmatter {
  title: string;
  description: string;
  date: string;
}

// Markdown mirror of /articles — the Layout advertises it via
// <link rel="alternate" type="text/markdown">.
export const GET: APIRoute = () => {
  const articles = Object.entries(
    import.meta.glob<{ frontmatter: ArticleFrontmatter }>('./articles/*.md', {
      eager: true,
    })
  )
    .map(([file, mod]) => ({
      slug: file.replace(/^\.\/articles\//, '').replace(/\.md$/, ''),
      title: mod.frontmatter.title,
      description: mod.frontmatter.description,
      date: mod.frontmatter.date,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

  const body = [
    '# Starboard articles',
    '',
    'Guides on evaluating GitHub repositories, reading tool signals, and choosing open-source dependencies.',
    '',
    ...articles.map(
      (article) =>
        `- [${article.title}](https://starboard.codevetter.com/articles/${article.slug}.md): ${article.description}`
    ),
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
