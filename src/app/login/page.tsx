import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignInButton } from '@/components/sign-in-button';
import { auth } from '@/lib/auth';
import { resolveInternalCallbackUrl } from '@/lib/auth-navigation';

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  OAuthSignin: {
    title: 'Could not start GitHub sign-in',
    body: 'GitHub rejected the first hop. Wait a few seconds and try again.',
  },
  OAuthCallback: {
    title: 'GitHub callback failed',
    body: 'The OAuth callback did not complete. Try once more.',
  },
  OAuthCreateAccount: {
    title: 'Could not create your session',
    body: 'Sign-in almost worked, but account creation failed. Try once more in a private window.',
  },
  Callback: {
    title: 'Sign-in interrupted',
    body: 'Something went wrong finishing login. Retry once.',
  },
  AccessDenied: {
    title: 'Access denied',
    body: 'GitHub denied the sign-in request. Make sure you approve Starboard on the permission screen.',
  },
  Configuration: {
    title: 'Sign-in is misconfigured',
    body: 'The OAuth app configuration looks broken on our side. Try again shortly or open an issue.',
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
  const key = error.split('/')[0] ?? error;
  return ERROR_COPY[key] ?? ERROR_COPY.Default;
}

function LoginAtmosphere() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_35%_0%,var(--brand-soft),transparent_60%)]"
    />
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between border-r border-border p-10 lg:flex xl:p-14">
      <Link href="/" className="inline-flex items-center gap-2.5 self-start">
        <img src="/favicon.svg" alt="" width="36" height="36" className="size-9" />
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">Starboard</span>
          <span className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground">
            project-aware tool discovery
          </span>
        </span>
      </Link>

      <div className="max-w-md space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
          Project-aware tool intelligence
        </p>
        <h1 className="font-display text-balance text-3xl xl:text-4xl">
          Stars that stay useful after you close the tab.
        </h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Sync GitHub stars, connect public projects, find similar repositories, and discover tools
          grounded in what those peers actually use.
        </p>

        <div className="space-y-2.5 pt-2">
          {[
            { label: 'Library', body: 'Stars, lists, tags — built for 1,000+' },
            { label: 'Discover', body: 'Search a public catalog by intent and evidence' },
            { label: 'Projects', body: 'Ground tool matches in similar repositories' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
            >
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-brand" />
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Live at <span className="font-mono text-muted-foreground">starboard.codevetter.com</span>
      </p>
    </aside>
  );
}

interface FormPanelProps {
  continuedRepository: string | null;
  errorInfo: { title: string; body: string } | null;
  callbackUrl: string;
}

function FormPanelHeader({ continuedRepository }: { continuedRepository: string | null }) {
  return (
    <div className="mb-8 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground lg:hidden"
      >
        <span className="inline-block size-1.5 rounded-full bg-brand" />
        Starboard · tool intelligence
      </Link>
      <h2 className="font-display text-balance text-3xl">
        {continuedRepository ? `Connect ${continuedRepository}` : 'Continue to Starboard'}
      </h2>
      <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
        {continuedRepository
          ? `Your preview stays attached to ${continuedRepository}. Sign in to confirm the connection and keep its recommendations. `
          : 'Sign in with GitHub to connect public projects and keep your recommendations. '}
        We only request{' '}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-foreground">
          read:user
        </code>{' '}
        — public profile and stars. No write access.
      </p>
    </div>
  );
}

function SignInCard({ continuedRepository, errorInfo, callbackUrl }: FormPanelProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      {errorInfo && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-left"
        >
          <p className="text-sm font-semibold text-destructive">{errorInfo.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-destructive">{errorInfo.body}</p>
        </div>
      )}

      {continuedRepository && !errorInfo && (
        <div className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-left">
          <p className="text-xs font-medium text-foreground">Continuing your preview</p>
          <p className="mt-1 truncate text-sm text-foreground">{continuedRepository}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing is connected until you confirm it on Projects.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <SignInButton label="Continue with GitHub" callbackUrl={callbackUrl} fullWidth />

        <div className="relative">
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
          <p className="relative mx-auto w-fit bg-card px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            After you sign in
          </p>
        </div>

        <ul className="space-y-2.5 text-xs text-muted-foreground">
          <li className="flex gap-2.5">
            <span className="text-brand-ink">✓</span>
            Choose a public repository from GitHub or paste its URL
          </li>
          <li className="flex gap-2.5">
            <span className="text-brand-ink">✓</span>
            Compare it with similar projects across the public catalog
          </li>
          <li className="flex gap-2.5">
            <span className="text-brand-ink">✓</span>
            Inspect repository-sourced tool evidence and save the project
          </li>
        </ul>
      </div>
    </div>
  );
}

function FormPanel(props: FormPanelProps) {
  const { continuedRepository, errorInfo, callbackUrl } = props;
  return (
    <div className="flex flex-col justify-center px-5 py-12 sm:px-10 lg:px-12 xl:px-16">
      <div className="mx-auto w-full max-w-md">
        <FormPanelHeader continuedRepository={continuedRepository} />
        <SignInCard
          continuedRepository={continuedRepository}
          errorInfo={errorInfo}
          callbackUrl={callbackUrl}
        />
        <div className="mt-8 space-y-3 text-center text-xs text-muted-foreground lg:text-left">
          <p>
            Prefer to look first?{' '}
            <Link
              href="/discover"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Browse Discover
            </Link>
            {' · '}
            <Link
              href="/"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = resolveInternalCallbackUrl(params.callbackUrl);
  const callback = new URL(callbackUrl, 'https://starboard.codevetter.com');
  const continuedRepository =
    callback.pathname === '/projects' ? callback.searchParams.get('repository') : null;
  const session = await auth();
  if (session?.user?.githubId) {
    redirect(callbackUrl);
  }
  const errorInfo = resolveError(params.error);

  return (
    <div className="relative flex min-h-svh w-full overflow-hidden bg-background text-foreground">
      <LoginAtmosphere />
      <div className="relative mx-auto grid w-full max-w-6xl flex-1 lg:grid-cols-2">
        <BrandPanel />
        <FormPanel
          continuedRepository={continuedRepository}
          errorInfo={errorInfo}
          callbackUrl={callbackUrl}
        />
      </div>
    </div>
  );
}
