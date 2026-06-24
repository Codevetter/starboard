'use client';

import { Copy, Link2, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { InsightReportType } from '@/lib/insight-reports';

interface ShareReportButtonProps {
  type: InsightReportType;
  projectSlug?: string;
  label?: string;
}

export function ShareReportButton({
  type,
  projectSlug,
  label = 'Share report',
}: ShareReportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          projectSlug,
          redactPrivate: true,
        }),
      });
      if (!response.ok) throw new Error('Failed to create report');
      const payload = (await response.json()) as { url: string };
      const absolute =
        typeof window !== 'undefined' ? `${window.location.origin}${payload.url}` : payload.url;
      setShareUrl(absolute);
    } catch {
      setError('Could not create share link.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard may be unavailable in some browsers.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={loading} onClick={createReport}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
        {label}
      </Button>
      {shareUrl && (
        <>
          <Button variant="ghost" size="sm" onClick={copyLink}>
            <Copy className="size-4" />
            Copy link
          </Button>
          <a href={shareUrl} className="text-xs text-muted-foreground hover:underline">
            {shareUrl}
          </a>
        </>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
