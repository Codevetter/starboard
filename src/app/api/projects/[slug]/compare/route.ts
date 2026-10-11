import { type NextRequest, NextResponse } from 'next/server';
import { loadOwnedProject } from '@/lib/project-route-helpers';
import { knowledgePipelineEnabled } from '@/lib/knowledgebase';
import { knowledgeProjectCandidates } from '@/lib/project-intelligence';
import { compareKnowledgeDecisions } from '@/lib/knowledge-decisions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!knowledgePipelineEnabled())
    return NextResponse.json(
      { error: 'Model comparison is available after the Knowledgebase migration.' },
      { status: 503 }
    );
  const loaded = await loadOwnedProject(
    (await params).slug,
    true,
    request.nextUrl.searchParams.get('path') || undefined
  );
  if ('error' in loaded) return loaded.error;
  try {
    const candidates = (await knowledgeProjectCandidates(loaded.project)).slice(0, 20);
    const comparison = await compareKnowledgeDecisions(loaded.project, candidates);
    const engines = Object.fromEntries(
      Object.entries(comparison.engines).map(([key, { raw: _raw, ...engine }]) => [key, engine])
    );
    return NextResponse.json({
      ...comparison,
      engines,
      candidates: candidates.map(({ id, fullName, htmlUrl }) => ({
        id: String(id),
        fullName,
        htmlUrl,
      })),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          'Comparison could not complete. Source coverage or the decision service is unavailable.',
      },
      { status: 503 }
    );
  }
}
