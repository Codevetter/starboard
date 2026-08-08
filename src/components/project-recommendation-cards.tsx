'use client';

import { ArrowUpRight, ThumbsDown, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  trackRecommendationFeedback,
  trackRecommendationInspected,
  type RecommendationKind,
  type RecommendationRetrievalMode,
  type RecommendationSentiment,
} from '@/lib/analytics';
import type {
  GroundedToolRecommendation,
  ProjectRecommendation,
} from '@/lib/project-recommendations';

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function RecommendationFeedback({
  kind,
  rank,
  retrievalMode,
  supportCount,
  confidence,
}: {
  kind: RecommendationKind;
  rank: number;
  retrievalMode: RecommendationRetrievalMode;
  supportCount?: number;
  confidence?: number;
}) {
  const [sentiment, setSentiment] = useState<RecommendationSentiment | null>(null);

  function rate(next: RecommendationSentiment) {
    if (sentiment === next) return;
    setSentiment(next);
    trackRecommendationFeedback({
      kind,
      sentiment: next,
      rank,
      retrievalMode,
      supportCount,
      confidence,
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t pt-3">
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {sentiment ? 'Feedback saved — you can change it' : 'Useful recommendation?'}
      </span>
      <div className="flex gap-1" aria-label="Recommendation feedback">
        <Button
          type="button"
          variant={sentiment === 'useful' ? 'secondary' : 'ghost'}
          size="icon-sm"
          className="size-11"
          aria-pressed={sentiment === 'useful'}
          aria-label="Useful recommendation"
          onClick={() => rate('useful')}
        >
          <ThumbsUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant={sentiment === 'not_useful' ? 'secondary' : 'ghost'}
          size="icon-sm"
          className="size-11"
          aria-pressed={sentiment === 'not_useful'}
          aria-label="Not a useful recommendation"
          onClick={() => rate('not_useful')}
        >
          <ThumbsDown className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ProjectRecommendationCard({
  recommendation,
  rank,
  retrievalMode,
}: {
  recommendation: ProjectRecommendation;
  rank: number;
  retrievalMode: RecommendationRetrievalMode;
}) {
  function inspect() {
    trackRecommendationInspected('repository', rank, retrievalMode);
  }

  return (
    <Card className="rounded-lg py-4 shadow-none">
      <CardHeader className="gap-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              <Link
                href={`/explore/${recommendation.fullName}`}
                className="hover:underline"
                onClick={inspect}
              >
                {recommendation.fullName}
              </Link>
            </CardTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline">#{rank}</Badge>
              {recommendation.language && (
                <Badge variant="secondary">{recommendation.language}</Badge>
              )}
              <Badge variant="outline">{formatNumber(recommendation.stargazersCount)} stars</Badge>
            </div>
          </div>
          <Button asChild variant="ghost" size="icon-sm">
            <Link
              href={recommendation.htmlUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${recommendation.fullName} on GitHub`}
              onClick={inspect}
            >
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {recommendation.description ?? 'No repository description is available.'}
        </p>
        <ul className="space-y-1.5 text-sm">
          {recommendation.evidence.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <RecommendationFeedback kind="repository" rank={rank} retrievalMode={retrievalMode} />
      </CardContent>
    </Card>
  );
}

function toolSignal(recommendation: GroundedToolRecommendation): {
  label: string;
  averageConfidence: number;
} {
  const averageConfidence =
    recommendation.sources.reduce((sum, source) => sum + source.confidence, 0) /
    Math.max(recommendation.sources.length, 1);
  const label =
    recommendation.supportCount >= 3 && averageConfidence >= 90
      ? 'Strong peer signal'
      : recommendation.supportCount >= 2
        ? 'Repeated peer signal'
        : 'Early peer signal';
  return { label, averageConfidence };
}

export function GroundedToolRecommendationCard({
  recommendation,
  rank,
  retrievalMode,
}: {
  recommendation: GroundedToolRecommendation;
  rank: number;
  retrievalMode: RecommendationRetrievalMode;
}) {
  const signal = toolSignal(recommendation);

  return (
    <Card className="rounded-lg py-4 shadow-none">
      <CardHeader className="gap-2 px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              <Link
                href={`/tools/${encodeURIComponent(recommendation.key)}`}
                className="hover:underline"
                onClick={() => trackRecommendationInspected('tool', rank, retrievalMode)}
              >
                {recommendation.name}
              </Link>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{recommendation.category}</p>
          </div>
          <Badge variant="secondary">{signal.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <p className="text-sm">
          Used by {recommendation.supportCount} grounded{' '}
          {recommendation.supportCount === 1 ? 'peer' : 'peers'} with an average detection
          confidence of {Math.round(signal.averageConfidence)}%.
        </p>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Repository evidence</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {recommendation.sources.slice(0, 4).map((source) => (
              <li key={source.repoId} className="flex items-center justify-between gap-3">
                <Link
                  href={`/explore/${source.fullName}`}
                  className="min-w-0 truncate hover:underline"
                  onClick={() => trackRecommendationInspected('tool', rank, retrievalMode)}
                >
                  {source.fullName}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {Math.round(source.confidence)}%
                </span>
              </li>
            ))}
          </ul>
          {recommendation.sources.length > 4 && (
            <p className="mt-2 text-xs text-muted-foreground">
              And {recommendation.sources.length - 4} more{' '}
              {recommendation.sources.length - 4 === 1 ? 'repository' : 'repositories'}.
            </p>
          )}
        </div>
        <RecommendationFeedback
          kind="tool"
          rank={rank}
          retrievalMode={retrievalMode}
          supportCount={recommendation.supportCount}
          confidence={signal.averageConfidence}
        />
      </CardContent>
    </Card>
  );
}
