import Link from "next/link";

export const metadata = {
  title: "Privacy — Starboard",
  description: "What Starboard stores and what it never collects.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-7">
      <Link href="/" className="text-xs text-muted-foreground hover:underline">
        ← Starboard
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-4 text-xs text-muted-foreground">Last updated: 2026-05-15.</p>

      <h2 className="mt-8 text-base font-semibold">What we store</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your GitHub OAuth identity when you sign in.</li>
        <li>The list of repos you&apos;ve starred + any saved-but-not-starred repos.</li>
        <li>Tags, lists, notes, and likes you create.</li>
        <li>Generated embeddings of starred repos for semantic search.</li>
      </ul>

      <h2 className="mt-8 text-base font-semibold">What we don&apos;t</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>No private-repo content. We only ever read the starred-repo list, which is already public.</li>
        <li>No third-party tracking pixels or marketing tags.</li>
        <li>No sharing of star data with anyone.</li>
      </ul>

      <h2 className="mt-8 text-base font-semibold">Deletion</h2>
      <p className="mt-2">
        Revoke Starboard&apos;s GitHub OAuth grant from your GitHub
        settings to disconnect, or email the maintainer to delete your
        Starboard data entirely.
      </p>
    </main>
  );
}
