import NextAuth, { type Profile } from 'next-auth';
import GitHub from 'next-auth/providers/github';

import { db } from '@/db';
import { ping } from '@/lib/ping';

type GithubProfile = Profile | undefined;

const githubLogin = (profile: GithubProfile): string | undefined =>
  (profile as { login?: string } | undefined)?.login;

async function isFirstSignIn(githubId: string): Promise<boolean> {
  const existing = await db.execute({
    sql: 'SELECT 1 FROM users WHERE id = ? LIMIT 1',
    args: [githubId],
  });
  return existing.rows.length === 0;
}

async function upsertGithubUser(
  githubId: string,
  user: { image?: string | null; email?: string | null },
  profile: GithubProfile
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO users (id, username, avatar_url, email) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            avatar_url = excluded.avatar_url,
            email = COALESCE(excluded.email, email)`,
    args: [githubId, githubLogin(profile) ?? '', user.image ?? null, user.email ?? null],
  });
}

/** App Health application log for a first GitHub sign-in. Fails open inside the client. */
async function notifySignup(
  githubId: string,
  user: { email?: string | null },
  profile: GithubProfile
): Promise<void> {
  await ping('signup', {
    title: user.email ?? githubLogin(profile) ?? githubId,
    props: { githubId, login: githubLogin(profile) ?? null },
  });
}

export const { handlers, auth } = NextAuth({
  trustHost: true,
  // Branded surfaces instead of the stock Auth.js provider picker.
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    GitHub({
      authorization: {
        params: {
          // Minimal scopes: public profile + starred repos via user token.
          scope: 'read:user',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github') {
        try {
          // Email comes from the public GitHub profile (read:user scope) and is
          // NULL when the user keeps it private.
          // Fail-open: never block OAuth because D1 upsert failed.
          const isNewUser = await isFirstSignIn(account.providerAccountId);
          await upsertGithubUser(account.providerAccountId, user, profile);
          if (isNewUser) await notifySignup(account.providerAccountId, user, profile);
        } catch (error) {
          console.error('Failed to upsert user:', error);
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.githubId = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.user.githubId = token.githubId as string;
      return session;
    },
  },
});
