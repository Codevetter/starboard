'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { KnowledgeDecisionEngine } from '@/lib/knowledge-decisions';

type Engine = Omit<KnowledgeDecisionEngine, 'raw'>;
interface Comparison {
  comparison_id: string;
  input_hash: string;
  coverage?: { evidence_options_per_candidate: number; evidence_truncated: boolean };
  engines: { free_ai: Engine; jev: Engine };
  candidates: Array<{ id: string; fullName: string; htmlUrl: string }>;
}

function EngineSummary({ label, engine }: { label: string; engine: Engine }) {
  return (
    <div className="min-w-0 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium">{label}</h4>
        <Badge variant="outline">{engine.status}</Badge>
      </div>
      <p className="mt-2 break-words text-xs text-muted-foreground">
        {engine.resolved_model || 'Model not reported'} ·{' '}
        {engine.provider || 'Provider not reported'} · {engine.latency_ms} ms
      </p>
      {engine.status !== 'ok' && (
        <p className="mt-2 text-sm text-muted-foreground">
          {engine.status === 'disabled'
            ? 'This model has not been enabled.'
            : 'This model could not complete the comparison.'}
        </p>
      )}
      {engine.result?.abstained && (
        <p className="mt-2 text-sm text-muted-foreground">No supported matches.</p>
      )}
    </div>
  );
}

function ComparisonRows({ comparison }: { comparison: Comparison }) {
  return (
    <div className="space-y-3">
      {comparison.candidates.map((candidate) => {
        const baseline = comparison.engines.free_ai.result?.items.find(
          (item) => item.candidate_id === candidate.id
        );
        const jev = comparison.engines.jev.result?.items.find(
          (item) => item.candidate_id === candidate.id
        );
        return (
          <div key={candidate.id} className="rounded-lg border p-4">
            <a
              href={candidate.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="break-words text-sm font-medium underline-offset-4 hover:underline"
            >
              {candidate.fullName}
            </a>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ['Current model', baseline],
                ['Jev', jev],
              ].map(([label, item]) => {
                const decision = item as typeof baseline;
                return (
                  <div key={String(label)} className="min-w-0 text-sm">
                    <p className="font-medium">
                      {String(label)}: {decision?.verdict || 'No decision'}
                    </p>
                    {decision?.project_evidence[0] && (
                      <p className="mt-1 break-words text-muted-foreground">
                        Project: “{decision.project_evidence[0].excerpt}”
                      </p>
                    )}
                    {decision?.candidate_evidence[0] && (
                      <p className="mt-1 break-words text-muted-foreground">
                        Repository: “{decision.candidate_evidence[0].excerpt}”
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectModelComparison({ projectId, scope }: { projectId: number; scope: string }) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function compare() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/compare?path=${encodeURIComponent(scope)}`,
        { method: 'POST' }
      );
      const body = (await response.json()) as Comparison & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Comparison could not complete.');
      setComparison(body as Comparison);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Comparison could not complete.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Compare decision models</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            See how the current model and Jev judge the same catalog candidates and source evidence.
            Agreement alone does not establish which recommendations are better.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={compare}>
          {loading ? 'Comparing…' : 'Compare models'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {comparison && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <EngineSummary label="Current model" engine={comparison.engines.free_ai} />
            <EngineSummary label="Jev" engine={comparison.engines.jev} />
          </div>
          <p className="text-xs text-muted-foreground">
            {comparison.candidates.length} candidates · Same evidence for both models
            {comparison.coverage?.evidence_truncated &&
              ` · Limited to ${comparison.coverage.evidence_options_per_candidate} excerpts per repository`}
          </p>
          <ComparisonRows comparison={comparison} />
        </>
      )}
    </section>
  );
}
