import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

import { db } from '@/db';

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
          await db.execute({
            sql: `INSERT INTO users (id, username, avatar_url, email) VALUES (?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    username = excluded.username,
                    avatar_url = excluded.avatar_url,
                    email = COALESCE(excluded.email, email)`,
            args: [
              account.providerAccountId,
              (profile as { login?: string })?.login ?? '',
              user.image ?? null,
              user.email ?? null,
            ],
          });
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
