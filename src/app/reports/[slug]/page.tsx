import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { db } from '@/db';
import { parseInsightReportPayload } from '@/lib/insight-reports';

async function getPublicReport(slug: string) {
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

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  const payload = parseInsightReportPayload(row.payload as string);
  if (!payload) return null;

  return {
    slug: row.slug as string,
    type: row.report_type as string,
    title: row.title as string,
    snapshotAt: row.snapshot_at as string,
    ownerUsername: row.username as string,
    payload,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const report = await getPublicReport(slug);
  if (!report) return { title: 'Report not found' };
  return {
    title: `${report.title} - Starboard`,
    description: `Read-only Starboard insight report shared by @${report.ownerUsername}`,
  };
}

export default async function PublicReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = await getPublicReport(slug);
  if (!report) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{report.type}</Badge>
            <span className="text-xs text-muted-foreground">
              Snapshot {new Date(report.snapshotAt).toLocaleString()}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{report.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Shared by @{report.ownerUsername}. Private notes and library metadata are redacted.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(report.payload.summary).map(([key, value]) => (
            <div key={key} className="rounded-lg border p-4">
              <div className="text-lg font-semibold">{String(value)}</div>
              <div className="text-xs text-muted-foreground">{key}</div>
            </div>
          ))}
        </section>

        {report.payload.sections.map((section) => (
          <section key={section.id} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {section.items.map((item) => (
                <article key={item.id} className="rounded-lg border p-4">
                  <h3 className="text-sm font-semibold">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                  {item.reasons.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {item.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-4 py-4 text-center sm:px-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Built with Starboard
          </Link>
        </div>
      </footer>
    </div>
  );
}
