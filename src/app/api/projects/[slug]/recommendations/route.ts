import { type NextRequest, NextResponse } from 'next/server';

import { loadOwnedProject } from '@/lib/project-route-helpers';
import { retrieveProjectIntelligence } from '@/lib/project-intelligence';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const loaded = await loadOwnedProject((await params).slug);
  if ('error' in loaded) return loaded.error;
  const { project } = loaded;

  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 24) || 24, 1),
    50
  );
  const recommendations = await retrieveProjectIntelligence(project, limit);

  return NextResponse.json({
    project,
    ...recommendations,
  });
}
