'use client';

import { ArrowUpRight, BellRing, Loader2 } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AlertRules } from '@/lib/alert-preferences';
import type { WeeklyAlertItem } from '@/lib/weekly-alerts';

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

interface InboxResponse {
  enabled: boolean;
  alerts: WeeklyAlertItem[];
  rules: AlertRules;
}

function laneLabel(lane: WeeklyAlertItem['lane']): string {
  if (lane === 'release') return 'Release';
  if (lane === 'momentum') return 'Momentum';
  return 'Maintenance';
}

export function AlertInboxPanel() {
  const { data, error, isLoading } = useSWR<InboxResponse>('/api/alerts/inbox', fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline size-4 animate-spin" />
        Loading alert inbox
      </div>
    );
  }

  if (error || !data || !data.enabled) return null;

  if (data.alerts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No active alerts for your selected lanes.
      </div>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <BellRing className="size-4" />
        <h2 className="text-base font-semibold">Alert inbox</h2>
        <Badge variant="secondary" className="text-xs">
          {data.alerts.length}
        </Badge>
      </div>
      <div className="space-y-3">
        {data.alerts.slice(0, 8).map((alert) => (
          <div key={alert.id} className="rounded-md border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {laneLabel(alert.lane)}
              </Badge>
              <Link href={alert.starboardUrl} className="text-sm font-medium hover:underline">
                {alert.title}
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{alert.detail}</p>
            <Button asChild variant="ghost" size="xs" className="mt-2">
              <Link href={alert.sourceUrl} target="_blank" rel="noreferrer">
                GitHub
                <ArrowUpRight className="size-3" />
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
