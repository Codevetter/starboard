'use client';

import { ToolsView, type ToolsResponse } from '@/components/public-source/tools-view';

import {
  ToolGrid,
  ToolCard,
  confidenceLabel,
  confidenceClass,
  type ToolSummary,
} from '@/components/public-source/tool-cards';

import { ArrowUpRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { WorkspaceLayout } from '@/components/workspace-layout';
import {
  ToolIntelligenceGuide,
  type ToolScope,
  ToolFiltersSidebar,
} from '@/components/tool-intelligence-guide';
import { formatCompactCount } from '@/lib/repo-display';
import { jsonFetcher } from '@/lib/swr-fetcher';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const fetcher = jsonFetcher;

export default function ToolsPage() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ToolsContent isAuthenticated={status === 'authenticated'} />;
}

function filterTools(tools: ToolSummary[], query: string): ToolSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  return tools.filter(
    (tool) =>
      tool.toolName.toLowerCase().includes(q) ||
      tool.toolKey.toLowerCase().includes(q) ||
      tool.category.toLowerCase().includes(q)
  );
}

function ToolsContent({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [scope, setScope] = useState<ToolScope>('discover');
  const [minConfidence, setMinConfidence] = useState(0);
  const [query, setQuery] = useState('');
  const apiUrl = `/api/tools?scope=${scope}&min_confidence=${minConfidence}&min_stars=10000&limit=300`;
  const { data, error, isLoading, isValidating } = useSWR<ToolsResponse>(apiUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const isInitialLoading = isLoading && !data;

  const tools = useMemo(() => filterTools(data?.tools ?? [], query), [data?.tools, query]);
  return (
    <ToolsView
      data={data}
      tools={tools}
      error={error}
      isInitialLoading={isInitialLoading}
      isValidating={isValidating}
      scope={scope}
      minConfidence={minConfidence}
      query={query}
      isAuthenticated={isAuthenticated}
      setScope={setScope}
      setMinConfidence={setMinConfidence}
      setQuery={setQuery}
    />
  );
}
