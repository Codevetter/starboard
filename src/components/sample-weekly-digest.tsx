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
    repo: 'vercel/next.js',
    headline: 'v15.3 landed — 2 APIs you use changed',
    detail:
      'turbopack is now default and the `headers()` API is now async. You last reviewed this repo 3 months ago.',
    age: '2 days ago',
  },
  {
    type: 'momentum',
    repo: 'shadcn-ui/ui',
    headline: '+4,200 stars this week — top 0.1% velocity',
    detail:
      'Momentum spiked after the chart component shipped. 3 repos in your Design Systems list depend on it.',
    age: 'ongoing',
  },
  {
    type: 'reactivation',
    repo: 'facebook/lexical',
    headline: 'Dormant gem just resumed active development',
    detail:
      'You starred this 18 months ago. It had no releases for 9 months — then 4 shipped in the last 30 days.',
    age: '30 days',
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

export function SampleWeeklyDigest() {
  return (
    <section
      className="w-full overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Weekly intelligence digest preview"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-base font-semibold">Weekly Intelligence Digest</h3>
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-primary/20 text-[10px] font-semibold">
              PRO
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Delivered every Monday — insights ranked by what actually affects your work.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center text-xs">
          <div className="rounded-md border bg-card px-2 py-1.5">
            <div className="font-medium">1</div>
            <div className="text-muted-foreground">Release</div>
          </div>
          <div className="rounded-md border bg-card px-2 py-1.5">
            <div className="font-medium">1</div>
            <div className="text-muted-foreground">Trending</div>
          </div>
          <div className="rounded-md border bg-card px-2 py-1.5">
            <div className="font-medium">1</div>
            <div className="text-muted-foreground">Revival</div>
          </div>
        </div>
      </div>

      {/* Insight cards */}
      <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-3">
        {INSIGHTS.map((insight) => (
          <InsightCard key={insight.repo} insight={insight} />
        ))}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3 border-t bg-muted/20 px-5 py-5 text-center">
        <p className="text-sm font-medium">
          Get insights like these for your <span className="text-primary">own</span> starred repos
          every week.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <SignInButton label="Connect GitHub — it's free" />
        </div>
        <p className="text-xs text-muted-foreground">
          Free tier includes digest · no credit card needed
        </p>
      </div>
    </section>
  );
}
