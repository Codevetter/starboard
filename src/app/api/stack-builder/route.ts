import { NextResponse } from "next/server";

import { db } from "@/db";
import { auth } from "@/lib/auth";
import { buildStackBuilderReport, type StackRepoInput } from "@/lib/stack-builder";

export async function GET() {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 r.repo_updated_at,
                 ur.starred_at
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ur.user_id = ?
            AND ur.is_starred = 1
          ORDER BY ur.starred_at DESC, r.stargazers_count DESC
          LIMIT 1000`,
    args: [session.user.githubId],
  });

  const repos: StackRepoInput[] = result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    fullName: row.full_name as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stargazersCount: row.stargazers_count as number,
    archived: Boolean(row.archived),
    topics: JSON.parse((row.topics as string) || "[]"),
    repoUpdatedAt: row.repo_updated_at as string | null,
    starredAt: row.starred_at as string | null,
  }));

  return NextResponse.json(buildStackBuilderReport(repos));
}
