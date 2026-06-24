import { ArrowUpRight, Flame, RotateCcw, Sparkles, TrendingUp, Zap } from 'lucide-react';

import { SignInButton } from '@/components/sign-in-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type InsightType = 'release' | 'momentum' | 'reactivation';

type DigestInsight = {
  type: InsightType;
  repo: string;
  headline: string;
  detail: string;
  age: string;
};

const INSIGHTS: DigestInsight[] = [
  {
    type: 'release',
    repo: 'openai/gpt-3',
    headline: 'New model release: faster and more capable',
    detail:
      "The new model shows a 25% performance improvement on key benchmarks. Your project 'My-AI-App' depends on this.",
    age: '3 days ago',
  },
  {
    type: 'momentum',
    repo: 'google/material-design',
    headline: 'Major design update with new components',
    detail:
      'Material Design 3.0 is out with a new color system and dynamic theming. Time to upgrade your UI.',
    age: 'ongoing',
  },
];

const insightMeta: Record<InsightType, { icon: React.ReactNode; label: string; color: string }> = {
  release: {
    icon: <Zap className="size-3.5" />,
    label: 'Release',
    color: 'text-blue-500 bg-blue-500/10',
  },
  momentum: {
    icon: <TrendingUp className="size-3.5" />,
    label: 'Momentum',
    color: 'text-emerald-500 bg-emerald-500/10',
  },
  reactivation: {
    icon: <RotateCcw className="size-3.5" />,
    label: 'Reactivated',
    color: 'text-amber-500 bg-amber-500/10',
  },
};

function InsightCard({ insight }: { insight: DigestInsight }) {
  const meta = insightMeta[insight.type];
  return (
    <div className="relative rounded-lg border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}
        >
          {meta.icon}
          {meta.label}
        </span>
        <span className="text-xs text-muted-foreground">{insight.age}</span>
      </div>
      <p className="text-sm font-semibold text-foreground">
        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{insight.repo}</span>
        {insight.headline}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">{insight.detail}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="xs" disabled>
          <Flame className="size-3" />
          View in Starboard
        </Button>
        <Button variant="ghost" size="xs" disabled>
          GitHub
          <ArrowUpRight className="size-3" />
        </Button>
      </div>
    </div>
  );
}

export function WeeklyActionPreview() {
  return (
    <section
      className="w-full overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Weekly action preview"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-base font-semibold">Weekly Action Preview</h3>
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-primary/20 text-[10px] font-semibold">
              PAID
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            A preview of the actionable insights you&apos;ll get with our paid plan.
          </p>
        </div>
      </div>

      {/* Insight cards */}
      <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2">
        {INSIGHTS.map((insight) => (
          <InsightCard key={insight.repo} insight={insight} />
        ))}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3 border-t bg-muted/20 px-5 py-5 text-center">
        <p className="text-sm font-medium">
          Get actionable insights like these for your <span className="text-primary">own</span>{' '}
          starred repos every week.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <SignInButton label="Upgrade to Pro" />
        </div>
        <p className="text-xs text-muted-foreground">
          Pro plan includes weekly action digests and more.
        </p>
      </div>
    </section>
  );
}
