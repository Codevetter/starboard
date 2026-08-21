'use client';

import { Database, GitBranch, ScanSearch } from 'lucide-react';

import { Button } from '@/components/ui/button';

export type ToolScope = 'discover' | 'user' | 'all';

const TOOL_SCOPES: Array<{
  value: ToolScope;
  label: string;
  description: (minStars: number) => string;
}> = [
  {
    value: 'discover',
    label: 'Popular tools',
    description: (minStars) =>
      `Tools detected across public catalog repositories with at least ${minStars.toLocaleString()} stars.`,
  },
  {
    value: 'user',
    label: 'My library',
    description: () => 'Tools detected in repositories you starred or saved to your Library.',
  },
  {
    value: 'all',
    label: 'Combined',
    description: (minStars) =>
      `Popular public repositories at ${minStars.toLocaleString()}+ stars and My Library together. Each repository is counted once.`,
  },
];

interface ToolScopeSelectorProps {
  scope: ToolScope;
  minStars: number;
  isAuthenticated: boolean;
  onScopeChange: (scope: ToolScope) => void;
}

export function ToolScopeSelector(props: ToolScopeSelectorProps) {
  const { scope, minStars, isAuthenticated, onScopeChange } = props;
  const selected = TOOL_SCOPES.find((option) => option.value === scope) ?? TOOL_SCOPES[0];

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Repository scope">
        {TOOL_SCOPES.map((option) => {
          const requiresSignIn = option.value !== 'discover' && !isAuthenticated;
          return (
            <Button
              key={option.value}
              type="button"
              variant={scope === option.value ? 'default' : 'outline'}
              size="sm"
              disabled={requiresSignIn}
              aria-pressed={scope === option.value}
              aria-describedby="tool-scope-description"
              title={
                requiresSignIn
                  ? `Sign in to use ${option.label}. ${option.description(minStars)}`
                  : option.description(minStars)
              }
              onClick={() => onScopeChange(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      <p
        id="tool-scope-description"
        className="max-w-2xl text-xs leading-relaxed text-muted-foreground"
      >
        <span className="font-medium text-foreground">{selected.label}:</span>{' '}
        {selected.description(minStars)}
        {!isAuthenticated && ' Sign in to compare this with My Library.'}
      </p>
    </div>
  );
}

export function ToolIntelligenceGuide({ disclaimer }: { disclaimer?: string }) {
  return (
    <section
      aria-labelledby="tool-intelligence-method"
      className="rounded-lg border bg-muted/20 px-4 py-4 sm:px-5"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
          <ScanSearch className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="tool-intelligence-method" className="text-sm font-semibold">
            How Tool Intelligence works
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Starboard detects tools from stored repository evidence, then aggregates those
            detections across the repository scope you choose. Open any tool to inspect the
            repositories and source evidence behind its count.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t pt-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex gap-2.5">
          <Database className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Sources:</span> manifests, lockfiles, and
            SBOMs are strongest; README and topic signals are more tentative.
          </p>
        </div>
        <div className="flex gap-2.5">
          <ScanSearch
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Confidence:</span> describes the detection
            evidence, not whether a tool is right for your project.
          </p>
        </div>
        <div className="flex gap-2.5">
          <GitBranch
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Counts:</span> distinct repositories in
            the selected scope, so Combined does not double-count overlaps.
          </p>
        </div>
      </div>

      {disclaimer && (
        <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          {disclaimer}
        </p>
      )}
    </section>
  );
}
