import { NextResponse } from 'next/server';

import { db } from '@/db';
import { TOOL_ACCURACY_DISCLAIMER } from '@/lib/repo-tools';

export async function GET(_request: Request, { params }: { params: Promise<{ repoId: string }> }) {
  const { repoId: rawId } = await params;
  const repoId = parseInt(rawId, 10);
  if (!Number.isInteger(repoId)) {
    return NextResponse.json({ error: 'Invalid repo ID' }, { status: 400 });
  }

  const result = await db.execute({
    sql: `SELECT tool_key, tool_name, category, confidence, sources, detected_at
          FROM repo_tools
          WHERE repo_id = ?
          ORDER BY confidence DESC, tool_name ASC`,
    args: [repoId],
  });

  return NextResponse.json({
    repoId,
    disclaimer: TOOL_ACCURACY_DISCLAIMER,
    tools: result.rows.map((row) => ({
      toolKey: row.tool_key as string,
      toolName: row.tool_name as string,
      category: row.category as string,
      confidence: row.confidence as number,
      sources: JSON.parse((row.sources as string) || '[]') as string[],
      detectedAt: row.detected_at as string,
    })),
  });
}
