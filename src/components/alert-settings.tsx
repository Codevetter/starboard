'use client';

import { Bell, Loader2 } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AlertLane, AlertRules } from '@/lib/alert-preferences';

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

const laneLabels: Record<AlertLane, string> = {
  release: 'Recent releases',
  maintenance: 'Maintenance & dormancy',
  momentum: 'Momentum changes',
};

interface PreferencesResponse {
  rules: AlertRules;
}

function toggleLane(lanes: AlertLane[], lane: AlertLane): AlertLane[] {
  return lanes.includes(lane) ? lanes.filter((item) => item !== lane) : [...lanes, lane];
}

export function AlertSettingsPanel() {
  const { data, error, isLoading, mutate } = useSWR<PreferencesResponse>(
    '/api/alerts/preferences',
    fetcher
  );
  const [saving, setSaving] = useState(false);

  const rules = data?.rules;

  const saveRules = async (patch: Partial<AlertRules>) => {
    if (!rules) return;
    setSaving(true);
    try {
      const response = await fetch('/api/alerts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error('Failed to save alert preferences');
      await mutate();
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-lg py-4 shadow-none">
        <CardContent className="flex items-center gap-2 px-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading alert settings
        </CardContent>
      </Card>
    );
  }

  if (error || !rules) return null;

  return (
    <Card className="rounded-lg py-4 shadow-none">
      <CardHeader className="px-4">
        <div className="flex items-center gap-2">
          <Bell className="size-4" />
          <CardTitle className="text-base">Repository alerts</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            Quiet by default
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Opt into release, momentum, and maintenance lanes. Weekly digest stays off until you
          enable it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(laneLabels) as AlertLane[]).map((lane) => {
            const enabled = rules.lanes.includes(lane);
            return (
              <Button
                key={lane}
                variant={enabled ? 'secondary' : 'outline'}
                size="sm"
                disabled={saving}
                onClick={() => saveRules({ lanes: toggleLane(rules.lanes, lane) })}
              >
                {laneLabels[lane]}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={rules.inAppNotifications ? 'secondary' : 'outline'}
            size="sm"
            disabled={saving}
            onClick={() => saveRules({ inAppNotifications: !rules.inAppNotifications })}
          >
            In-app inbox
          </Button>
          <Button
            variant={rules.weeklyDigest ? 'secondary' : 'outline'}
            size="sm"
            disabled={saving}
            onClick={() => saveRules({ weeklyDigest: !rules.weeklyDigest })}
          >
            Weekly digest
          </Button>
          <Button
            variant={rules.weeklyDigest && !rules.emailOptOut ? 'secondary' : 'outline'}
            size="sm"
            disabled={saving || !rules.weeklyDigest}
            title={
              rules.weeklyDigest
                ? 'Weekly digest email (uses your public GitHub email)'
                : 'Enable the weekly digest first'
            }
            onClick={() => saveRules({ emailOptOut: !rules.emailOptOut })}
          >
            Email delivery
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
