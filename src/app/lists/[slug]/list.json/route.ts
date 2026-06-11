import { NextResponse } from "next/server";

import { db } from "@/db";

export const dynamic = "force-dynamic";

interface ListRow {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  description: string | null;
  user_id: string;
  username: string;
  avatar_url: string;
}

interface RepoRow {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  owner_login: string;
  owner_avatar: string;
  topics: string | null;
}

/**
 * Public JSON twin of /lists/[slug]. Lets a shared starboard list be
 * embedded into someone else's site, dashboard, or static-site sidebar
 * without scraping the HTML — same data, machine-readable.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;

  const listResult = await db.execute({
    sql: `SELECT ul.id, ul.name, ul.color, ul.icon, ul.description, ul.user_id,
                 u.username, u.avatar_url
          FROM user_lists ul
          JOIN users u ON u.id = ul.user_id
          WHERE ul.slug = ? AND ul.is_public = 1`,
    args: [slug],
  });

  if (listResult.rows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const row = listResult.rows[0] as unknown as ListRow;

  const reposResult = await db.execute({
    sql: `SELECT r.id, r.full_name, r.description, r.language,
                 r.stargazers_count, r.html_url, r.owner_login, r.owner_avatar,
                 r.topics
          FROM user_repo_lists url
          JOIN repos r ON r.id = url.repo_id
          WHERE url.list_id = ? AND url.user_id = ?
          ORDER BY r.stargazers_count DESC`,
    args: [row.id, row.user_id],
  });
  const repos = reposResult.rows as unknown as RepoRow[];

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      list: {
        slug,
        name: row.name,
        color: row.color,
        icon: row.icon,
        description: row.description,
      },
      owner: {
        username: row.username,
        avatarUrl: row.avatar_url,
      },
      count: repos.length,
      repos: repos.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        description: r.description,
        language: r.language,
        stargazersCount: r.stargazers_count,
        htmlUrl: r.html_url,
        owner: { login: r.owner_login, avatarUrl: r.owner_avatar },
        topics: (() => {
          try {
            return r.topics ? JSON.parse(r.topics) : [];
          } catch {
            return [];
          }
        })(),
      })),
    },
    {
      headers: {
        // Public list visibility can be revoked, so do not let CDN caches
        // serve stale public copies after the owner makes the list private.
        "Cache-Control": "private, no-store",
      },
    },
  );
}
