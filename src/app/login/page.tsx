import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignInButton } from '@/components/sign-in-button';
import { auth } from '@/lib/auth';

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  OAuthSignin: {
    title: 'Could not start GitHub sign-in',
    body: 'GitHub rejected the first hop. Wait a few seconds and try again — repeated attempts can trip their temporary limits.',
  },
  OAuthCallback: {
    title: 'GitHub callback failed',
    body: 'The OAuth callback did not complete. This is often a temporary GitHub or network limit. Wait a minute, then retry once.',
  },
  OAuthCreateAccount: {
    title: 'Could not create your session',
    body: 'Sign-in almost worked, but account creation failed. Try once more in a private window.',
  },
  Callback: {
    title: 'Sign-in interrupted',
    body: 'Something went wrong finishing login. Retry once; if it keeps failing, wait a minute for GitHub rate limits to clear.',
  },
  AccessDenied: {
    title: 'Access denied',
    body: 'GitHub denied the sign-in request. Make sure you approve Starboard on the GitHub permission screen.',
  },
  Configuration: {
    title: 'Sign-in is misconfigured',
    body: 'The OAuth app configuration looks broken on our side. This is not your account — try again shortly or open an issue.',
  },
  Verification: {
    title: 'Verification failed',
    body: 'The sign-in link expired or was already used. Start again from this page.',
  },
  Default: {
    title: 'Sign-in failed',
    body: 'Something went wrong. Wait a few seconds and try again with GitHub.',
  },
};

function resolveError(error: string | undefined) {
  if (!error) return null;
  // Auth.js sometimes appends path fragments; normalize.
  const key = error.split('/')[0] ?? error;
  if (/rate.?limit/i.test(key) || key === 'TooManyRequests') {
    return {
      title: 'Temporarily rate limited',
      body: 'GitHub or the edge network asked us to slow down. Wait about a minute, then sign in once — do not hammer the button.',
    };
  }
  return ERROR_COPY[key] ?? ERROR_COPY.Default;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user?.githubId) {
    redirect('/stars');
  }

  const params = await searchParams;
  const callbackUrl =
    params.callbackUrl && params.callbackUrl.startsWith('/') ? params.callbackUrl : '/stars';
  const errorInfo = resolveError(params.error);

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background px-5 py-12 dark:bg-[oklch(0.1_0_0)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.45_0.12_250_/_0.22),transparent_55%),radial-gradient(ellipse_at_bottom_right,oklch(0.55_0.14_145_/_0.12),transparent_45%)]"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            Starboard
          </Link>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Sign in to Starboard</h1>
          <p className="max-w-sm text-pretty text-sm text-muted-foreground">
            Connect GitHub once. We only read your public profile and starred repos — no write
            scopes, revoke anytime.
          </p>
        </div>

        <div className="rounded-2xl border bg-card/80 p-6 shadow-xl shadow-black/20 backdrop-blur sm:p-8">
          {errorInfo && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left"
            >
              <p className="text-sm font-semibold text-amber-100">{errorInfo.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/80">{errorInfo.body}</p>
            </div>
          )}

          <div className="flex flex-col items-stretch gap-4">
            <SignInButton label="Continue with GitHub" callbackUrl={callbackUrl} fullWidth />
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-emerald-400">✓</span>
                Read-only access (read:user only)
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400">✓</span>
                Sync stars, lists, and search your library
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400">✓</span>
                Free and open source
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prefer to look around first?{' '}
          <Link
            href="/discover"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Browse public Discover
          </Link>
          {' · '}
          <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
            Back home
          </Link>
        </p>
      </div>
    </div>
  );
}
