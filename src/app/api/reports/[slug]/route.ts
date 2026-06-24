import { NextResponse } from 'next/server';

import { db } from '@/db';
import { parseInsightReportPayload } from '@/lib/insight-reports';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await db.execute({
    sql: `SELECT ir.slug,
                 ir.report_type,
                 ir.title,
                 ir.snapshot_at,
                 ir.payload,
                 u.username
          FROM insight_reports ir
          JOIN users u ON u.id = ir.user_id
          WHERE ir.slug = ?
            AND ir.is_public = 1
          LIMIT 1`,
    args: [slug],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const row = result.rows[0]!;
  const payload = parseInsightReportPayload(row.payload as string);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid report payload' }, { status: 500 });
  }

  return NextResponse.json({
    slug: row.slug as string,
    type: row.report_type as string,
    title: row.title as string,
    snapshotAt: row.snapshot_at as string,
    ownerUsername: row.username as string,
    payload,
  });
}
