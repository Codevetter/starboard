import Link from 'next/link';

export const metadata = { title: 'Not found — Starboard' };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Not found</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        That repo or list isn&apos;t here. Try the discover feed.
      </p>
      <div className="mt-6 flex justify-center gap-4 text-sm">
        <Link href="/" className="underline">
          Home
        </Link>
        <Link href="/discover" className="underline">
          Discover
        </Link>
        <Link href="/about" className="underline">
          About
        </Link>
      </div>
    </main>
  );
}
