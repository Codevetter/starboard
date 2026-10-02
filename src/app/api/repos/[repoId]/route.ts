import { type NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

import { db } from '@/db';
import type { DbResult } from '@/db/client';
import { auth } from '@/lib/auth';

import {
  type GitHubRepoResponse,
  refreshRepoFromGitHub,
  repoMetadataIsStale,
  resolveRepo,
  upsertRepoFromGitHub,
} from '../resolve';

// Keep one stale-row refresh in flight per repo per Worker isolate. A durable
// cross-isolate lock would require shared state/schema; the GitHub read itself
// remains bounded to one request per eligible detail read in the meantime.
const staleRefreshes = new Map<number, Promise<void>>();

function scheduleStaleRefresh(repoId: number, fullName: string): boolean {
  if (staleRefreshes.has(repoId)) return true;

  let waitUntil: (promise: Promise<unknown>) => void;
  try {
    waitUntil = getCloudflareContext().ctx.waitUntil as (promise: Promise<unknown>) => void;
  } catch {
    // Outside a Worker there is no execution lifetime to hold the task open;
    // let the caller use the synchronous fallback instead.
    return false;
  }

  const refresh = (async () => {
    try {
      const accessToken = (await auth())?.accessToken ?? null;
      await refreshRepoFromGitHub(fullName, accessToken);
    } catch (refreshError) {
      console.warn('Repo metadata refresh failed; serving stored row:', refreshError);
    } finally {
      staleRefreshes.delete(repoId);
    }
  })();
  staleRefreshes.set(repoId, refresh);
  waitUntil(refresh);
  return true;
}

// Existing rows are refreshed from GitHub after the 12-hour TTL so star counts
// cannot silently freeze at insert time. catalogOnly stays a pure read so
// catalog callers cannot trigger writes or rate-limit spend.
async function refreshIfStale(
  row: Record<string, unknown>,
  repoId: number,
  catalogOnly: boolean
): Promise<boolean> {
  if (catalogOnly || !repoMetadataIsStale(row.fetched_at)) return false;
  if (scheduleStaleRefresh(repoId, row.full_name as string)) return false;

  // Keep local Next.js development behavior functional without a Worker ctx.
  try {
    const accessToken = (await auth())?.accessToken ?? null;
    return await refreshRepoFromGitHub(row.full_name as string, accessToken);
  } catch (refreshError) {
    console.warn('Repo metadata refresh failed; serving stored row:', refreshError);
    return false;
  }
}

function repoDetailResponse(row: Record<string, unknown>) {
  return NextResponse.json({
    repo: {
      id: row.id as number,
      name: row.name as string,
      full_name: row.full_name as string,
      owner_login: row.owner_login as string,
      owner_avatar: row.owner_avatar as string,
      html_url: row.html_url as string,
      description: row.description as string | null,
      language: row.language as string | null,
      stargazers_count: row.stargazers_count as number,
      archived: Boolean(row.archived),
      topics: JSON.parse((row.topics as string) || '[]'),
      repo_created_at: row.repo_created_at as string | null,
      repo_updated_at: row.repo_updated_at as string | null,
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId: rawId } = await params;
  const catalogOnly = request.nextUrl.searchParams.get('catalogOnly') === '1';

  // Support two modes:
  // 1. Numeric ID: /api/repos/12345
  // 2. Slug lookup: /api/repos/lookup?name=owner/repo
  let repoId: number;
  let cachedRepoResult: DbResult | null = null;

  if (rawId === 'lookup') {
    const name = request.nextUrl.searchParams.get('name');
    if (!name?.includes('/')) {
      return NextResponse.json({ error: 'name param required (owner/repo)' }, { status: 400 });
    }
    const [owner, repo] = name.split('/', 2);
    const resolved = await resolveRepo(owner, repo);
    if (!resolved) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }
    repoId = resolved.id;
    cachedRepoResult = resolved.cachedResult;
  } else {
    repoId = parseInt(rawId, 10);
    if (Number.isNaN(repoId)) {
      return NextResponse.json({ error: 'Invalid repo ID' }, { status: 400 });
    }
  }

  try {
    // Look up repo in our DB
    let repoResult =
      cachedRepoResult ??
      (await db.execute({
        sql: 'SELECT * FROM repos WHERE id = ?',
        args: [repoId],
      }));

    // Catalog-only callers must never turn a read into a cache mutation.
    if (repoResult.rows.length === 0 && catalogOnly) {
      return NextResponse.json(
        { error: 'Repository not found in public catalog' },
        { status: 404 }
      );
    }

    if (
      repoResult.rows.length > 0 &&
      (await refreshIfStale(repoResult.rows[0], repoId, catalogOnly))
    ) {
      repoResult = await db.execute({
        sql: 'SELECT * FROM repos WHERE id = ?',
        args: [repoId],
      });
    }

    // If not cached locally, fetch from GitHub and upsert
    if (repoResult.rows.length === 0) {
      const ghRes = await fetch(`https://api.github.com/repositories/${repoId}`, {
        next: { revalidate: 3600 },
      });

      if (!ghRes.ok) {
        if (ghRes.status === 404) {
          return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
        }
        return NextResponse.json(
          { error: 'Failed to fetch repository from GitHub' },
          { status: 502 }
        );
      }

      const gh = (await ghRes.json()) as GitHubRepoResponse;

      await upsertRepoFromGitHub(gh);

      repoResult = await db.execute({
        sql: 'SELECT * FROM repos WHERE id = ?',
        args: [repoId],
      });
    }

    return repoDetailResponse(repoResult.rows[0]);
  } catch (error) {
    console.error('Failed to fetch repo detail:', error);
    return NextResponse.json({ error: 'Failed to fetch repository' }, { status: 500 });
  }
}
