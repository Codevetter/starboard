import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  createNeedDrivenIntelligence,
  loadLatestDraftReport,
  loadLatestReviewedReport,
} from '@/lib/need-driven-intelligence';
import { loadOwnedProject } from '@/lib/project-route-helpers';
import { repoVectors } from '@/lib/repo-vectors';
import { generateEmbeddings } from '@/lib/embeddings';

/**
 * GET /api/projects/[slug]/intelligence
 *
 * Reads the persisted need-driven project intelligence report. This endpoint
 * never triggers external-agent spend — it only reads persisted draft and
 * reviewed reports. If no report exists and `?run=1` is passed, it runs the
 * deterministic pipeline once.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const loaded = await loadOwnedProject(slug);
  if ('error' in loaded) return loaded.error;
  const { repoId } = loaded;

  const dependencies = {
    database: db,
    vectorStore: repoVectors,
    embed: generateEmbeddings,
  };

  const [draft, reviewed] = await Promise.all([
    loadLatestDraftReport(repoId, dependencies),
    loadLatestReviewedReport(repoId, dependencies),
  ]);

  // If no report exists and the user requests a run, generate one
  const shouldRun = request.nextUrl.searchParams.get('run') === '1';
  if (!draft && shouldRun) {
    const inspected = await loadOwnedProject(slug, true);
    if ('error' in inspected) return inspected.error;
    const run = createNeedDrivenIntelligence(dependencies);
    try {
      const newDraft = await run(inspected.project);
      return NextResponse.json({ draft: newDraft, reviewed: null });
    } catch {
      return NextResponse.json(
        {
          error:
            'Project intelligence is unavailable. Please retry when source and review services are available.',
        },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ draft, reviewed });
}
