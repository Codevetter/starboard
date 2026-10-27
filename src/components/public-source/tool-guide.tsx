import { Database, GitBranch, ScanSearch } from 'lucide-react';

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
