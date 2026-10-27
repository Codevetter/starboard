import { ToolGrid, type ToolSummary } from '@/components/public-source/tool-cards';
import { WorkspaceLayout } from '@/components/workspace-layout';
import {
  ToolIntelligenceGuide,
  type ToolScope,
  ToolFiltersSidebar,
} from '@/components/tool-intelligence-guide';

export interface ToolsResponse {
  scope: ToolScope;
  minStars: number;
  minConfidence: number;
  disclaimer: string;
  tools: ToolSummary[];
}

export function ToolsView({
  data,
  tools,
  error,
  isInitialLoading,
  isValidating,
  scope,
  minConfidence,
  query,
  isAuthenticated,
  setScope,
  setMinConfidence,
  setQuery,
}: {
  data: ToolsResponse | undefined;
  tools: ToolSummary[];
  error: unknown;
  isInitialLoading: boolean;
  isValidating: boolean;
  scope: ToolScope;
  minConfidence: number;
  query: string;
  isAuthenticated: boolean;
  setScope: (scope: ToolScope) => void;
  setMinConfidence: (value: number | ((old: number) => number)) => void;
  setQuery: (query: string) => void;
}) {
  return (
    <WorkspaceLayout
      title="Tools"
      description="Inspect tools and the repository evidence behind each detection."
      searchQuery={query}
      onSearchChange={setQuery}
      searchPlaceholder="Filter tools..."
      sidebarLabel="Tool filters"
      sidebar={
        <ToolFiltersSidebar
          scope={scope}
          minStars={data?.minStars ?? 10_000}
          isAuthenticated={isAuthenticated}
          onScopeChange={setScope}
          minConfidence={minConfidence}
          onToggleConfidence={() => setMinConfidence((value) => (value >= 90 ? 0 : 90))}
        />
      }
    >
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">Tool intelligence</h1>
        <ToolIntelligenceGuide disclaimer={data?.disclaimer} />

        {isValidating && data && (
          <div className="text-sm text-muted-foreground">Refreshing tool intelligence...</div>
        )}

        {!isInitialLoading && !error && (
          <p className="text-sm text-muted-foreground">
            {tools.length} {tools.length === 1 ? 'tool' : 'tools'} match this view. Open a tool to
            inspect repository-level evidence.
          </p>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            Tool usage could not load.
          </div>
        )}

        <ToolGrid tools={tools} isInitialLoading={isInitialLoading} />

        {!isInitialLoading && !error && tools.length === 0 && (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No detected tools match this scope and filter.
          </p>
        )}
      </section>
    </WorkspaceLayout>
  );
}
