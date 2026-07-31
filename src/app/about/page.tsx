import Link from 'next/link';

export const metadata = {
  title: 'How to Organize and Semantically Search GitHub Stars | Starboard',
  description:
    'Use GitHub lists first, then learn when hybrid lexical and semantic search, tags, collections, and maintenance signals help organize a large star library.',
  alternates: {
    canonical: '/about',
  },
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-xs text-muted-foreground hover:underline">
        ← Starboard
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        How to organize and semantically search GitHub starred repositories
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        GitHub&apos;s native stars page is the right starting point: it groups repositories into
        public lists and searches by repository name or topic. When a library grows large, a
        read-only layer can also recover repositories by meaning, maintenance activity, notes, and
        the work you are doing now.
      </p>

      <div className="mt-10 space-y-10 text-sm leading-6">
        <section>
          <h2 className="text-xl font-semibold">Start with GitHub&apos;s native tools</h2>
          <p className="mt-3 text-muted-foreground">
            Use GitHub lists when a few stable public categories are enough. You can create a named
            list, add repositories from the Starred menu, and search stars by repository name or
            topic. This keeps organization on GitHub and needs no additional account connection.
          </p>
          <p className="mt-3 text-muted-foreground">
            A separate organizer becomes useful when you want to:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>search for an idea when names and topics use different words;</li>
            <li>
              combine language, tags, collections, activity, release, and maintenance filters;
            </li>
            <li>add private notes or custom tags to your own library;</li>
            <li>revisit repositories that changed since you starred them; or</li>
            <li>compare and group tools for a particular project.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">What semantic search adds</h2>
          <p className="mt-3 text-muted-foreground">
            Lexical search matches stored terms. Semantic search represents the query and repository
            description as vectors and retrieves similar meanings even when the words differ.
            Starboard combines SQLite FTS5 over names, descriptions, and topics with embedding
            retrieval, blends the ranks with reciprocal-rank fusion, and falls back to lexical
            results when the semantic service is unavailable.
          </p>
          <p className="mt-3 text-muted-foreground">
            Semantic similarity is not proof that a repository is good, maintained, secure, or right
            for your stack. It improves recall; source inspection, releases, maintenance evidence,
            and your judgment still determine whether to use a repository.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">A practical organization workflow</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>
              <strong>Sync read-only metadata.</strong> Starboard requests access to the public
              profile and starred repositories, not repository write scopes.
            </li>
            <li>
              <strong>Create a few durable collections.</strong> Organize outcomes such as
              “evaluation tools” or “local inference,” not every repository.
            </li>
            <li>
              <strong>Tag the details.</strong> Add language, workflow, status, or personal-use tags
              across collections.
            </li>
            <li>
              <strong>Search by intent.</strong> Try “local eval framework for RAG” instead of
              guessing a project name.
            </li>
            <li>
              <strong>Review activity signals.</strong> Check releases, development recency,
              archival state, and whether you have revisited it.
            </li>
            <li>
              <strong>Keep the decision on GitHub.</strong> Inspect the source and license, then
              star or unstar through GitHub.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How Starboard differs from a basic tag manager</h2>
          <p className="mt-3 text-muted-foreground">
            Tools such as Astral demonstrate the value of tags, rule-based filters, notes, README
            previews, and fast search. Starboard keeps those ideas and adds hybrid retrieval,
            release and maintenance radar, project-aware recommendations, and public discovery. This
            describes product surfaces; it is not a claim that one organizer is universally better.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Limits and privacy</h2>
          <p className="mt-3 text-muted-foreground">
            Starboard is not a replacement for GitHub, a security scanner, or an endorsement engine.
            Results can be incomplete or stale. The account permission is read-only, but synced
            metadata, tags, lists, and notes still become application data. Review the privacy page
            and revoke access from GitHub settings whenever you stop using the service.
          </p>
        </section>

        <p>
          <Link href="/discover" className="underline underline-offset-4">
            Browse public repositories
          </Link>{' '}
          without connecting GitHub, or sign in from the home page to organize your own stars. See{' '}
          <Link href="/tools" className="underline underline-offset-4">
            Tools
          </Link>{' '}
          and the{' '}
          <Link href="/changelog" className="underline underline-offset-4">
            Changelog
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
