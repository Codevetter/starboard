'use client';

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Boxes,
  Brain,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  Eye,
  KeyRound,
  Layers3,
  Loader2,
  Save,
  Search,
  Server,
  TestTube2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type {
  StackBuilderReport,
  StackCandidate,
  StackGoal,
  StackRoleId,
} from '@/lib/stack-builder';

const goals = ['web-app', 'ai-app', 'api-service', 'mobile-app'] as const;
const goalLabels: Record<StackGoal, string> = {
  'web-app': 'Web app',
  'ai-app': 'AI app',
  'api-service': 'API service',
  'mobile-app': 'Mobile app',
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function roleIcon(role: StackRoleId) {
  if (role === 'framework') return <Server className="size-4" />;
  if (role === 'ui') return <Code2 className="size-4" />;
  if (role === 'database') return <Database className="size-4" />;
  if (role === 'auth') return <KeyRound className="size-4" />;
  if (role === 'deployment') return <Cloud className="size-4" />;
  if (role === 'testing') return <TestTube2 className="size-4" />;
  if (role === 'observability') return <Eye className="size-4" />;
  return <Brain className="size-4" />;
}

function CandidateBlock({
  candidate,
  compact = false,
}: {
  candidate: StackCandidate;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'rounded-md border p-2' : 'rounded-md border bg-background/60 p-3'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/explore/${candidate.fullName}`}
            className="block truncate font-medium hover:underline"
          >
            {candidate.fullName}
          </Link>
          {!compact && candidate.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {candidate.description}
            </p>
          )}
        </div>
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          aria-label={`Open ${candidate.fullName} on GitHub`}
        >
          <Link href={candidate.htmlUrl} target="_blank" rel="noreferrer">
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {candidate.language && (
          <Badge variant="secondary" className="text-xs">
            {candidate.language}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          {formatNumber(candidate.stargazersCount)} stars
        </Badge>
        <Badge variant="outline" className="text-xs">
          score {candidate.score}
        </Badge>
        {candidate.warnings.map((warning) => (
          <Badge
            key={warning}
            variant="outline"
            className="gap-1 border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300"
          >
            <AlertTriangle className="size-3" />
            {warning}
          </Badge>
        ))}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...candidate.reasons, ...candidate.compatibilityNotes].slice(0, 5).map((reason) => (
            <Badge key={reason} variant="outline" className="text-xs text-muted-foreground">
              {reason}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleCard({ role }: { role: StackBuilderReport['roles'][number] }) {
  return (
    <Card className="rounded-lg py-4 shadow-none">
      <CardHeader className="gap-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge variant="outline" className="gap-1.5">
              {roleIcon(role.id)}
              {role.label}
            </Badge>
            <CardTitle className="mt-3 text-base">
              {role.selected ? role.selected.name : 'No strong match yet'}
            </CardTitle>
          </div>
          {role.selected && <CheckCircle2 className="size-5 text-emerald-500" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <p className="min-h-10 text-sm text-muted-foreground">{role.summary}</p>
        {role.selected ? (
          <CandidateBlock candidate={role.selected} />
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Star repos with related topics to fill this role.
          </div>
        )}
        {role.conflicts.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            {role.conflicts.join(' ')}
          </div>
        )}
        {role.alternatives.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              Alternatives
            </div>
            {role.alternatives.map((candidate) => (
              <CandidateBlock key={candidate.id} candidate={candidate} compact />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StackBuilderContent() {
  const searchParams = useSearchParams();
  const [goal, setGoal] = useQueryState('goal', parseAsStringLiteral(goals).withDefault('web-app'));
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [saving, setSaving] = useState(false);
  const [savedListId, setSavedListId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const language = searchParams.get('language')?.trim() ?? '';
  const listId = searchParams.get('list_id')?.trim() ?? '';
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('goal', goal);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (language) params.set('language', language);
    if (listId) params.set('list_id', listId);
    return `/api/stack-builder?${params.toString()}`;
  }, [goal, language, listId, searchQuery]);
  const { data, error, isLoading } = useSWR<StackBuilderReport>(apiUrl, fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const report = data ?? {
    goal,
    goalLabel: goalLabels[goal],
    roles: [],
    markdown: '',
    selectedRepoIds: [],
    summary: { totalRepos: 0, coveredRoles: 0, warningCount: 0, topLanguages: [] },
  };
  const sourceBadges = [
    searchQuery.trim() ? `Search: ${searchQuery.trim()}` : null,
    language ? `Language: ${language}` : null,
    listId ? `List #${listId}` : null,
  ].filter(Boolean);

  const exportMarkdown = () => {
    const blob = new Blob([report.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `starboard-${report.goal}-stack.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveAsList = async () => {
    if (report.selectedRepoIds.length === 0 || saving) return;
    setSaving(true);
    setSavedListId(null);
    setSaveError(null);
    try {
      const listResponse = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Stack: ${report.goalLabel}`,
          color: '#0ea5e9',
          icon: 'boxes',
        }),
      });
      if (!listResponse.ok) throw new Error(`${listResponse.status}`);
      const list = (await listResponse.json()) as { id: number };
      const responses = await Promise.all(
        report.selectedRepoIds.map((repoId) =>
          fetch(`/api/repos/${repoId}/list`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listId: list.id, assigned: true }),
          })
        )
      );
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        throw new Error(`Failed to assign one or more repos (${failed.status})`);
      }
      setSavedListId(list.id);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Failed to save the selected stack repositories.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 px-4 py-3 backdrop-blur-sm md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md border">
              <Boxes className="size-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Stack Builder</h1>
              <p className="text-sm text-muted-foreground">
                Compose a pragmatic app stack from your starred repositories.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/discover">Discover</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/stars">Library</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="space-y-3 p-4 md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ToggleGroup
            type="single"
            value={goal}
            onValueChange={(value) => {
              if (value) setGoal(value as StackGoal);
            }}
            variant="outline"
            size="sm"
            className="flex-wrap"
          >
            {goals.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {goalLabels[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-xl">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Start from a search result..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={exportMarkdown}
              disabled={!report.markdown}
            >
              <ArrowDownToLine className="size-4" />
              Markdown
            </Button>
            <Button
              className="gap-2"
              onClick={saveAsList}
              disabled={saving || report.selectedRepoIds.length === 0}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save list
            </Button>
          </div>
        </div>
        {sourceBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sourceBadges.map((badge) => (
              <Badge key={badge} variant="secondary">
                {badge}
              </Badge>
            ))}
          </div>
        )}
        {savedListId !== null && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            Saved selected stack repositories to list #{savedListId}.
          </div>
        )}
        {saveError !== null && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            {saveError}
          </div>
        )}
      </section>

      <section className="grid gap-3 px-4 pb-4 md:grid-cols-4 md:px-6">
        <Card className="rounded-lg py-4 shadow-none">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold">{report.summary.totalRepos}</div>
            <div className="text-sm text-muted-foreground">starred repos scanned</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg py-4 shadow-none">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold">{report.summary.coveredRoles}</div>
            <div className="text-sm text-muted-foreground">roles covered</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg py-4 shadow-none">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold">{report.summary.warningCount}</div>
            <div className="text-sm text-muted-foreground">warnings</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg py-4 shadow-none">
          <CardContent className="px-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Layers3 className="size-4" />
              Top languages
            </div>
            <div className="flex flex-wrap gap-1.5">
              {report.summary.topLanguages.length > 0 ? (
                report.summary.topLanguages.slice(0, 3).map(([topLanguage, count]) => (
                  <Badge key={topLanguage} variant="secondary">
                    {topLanguage} · {count}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Sync stars first.</span>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {error && (
        <div className="mx-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 md:mx-6">
          Stack Builder could not load.
        </div>
      )}

      {report.summary.totalRepos === 0 && !error && (
        <div className="mx-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground md:mx-6">
          Sync your GitHub stars to generate stack suggestions.
        </div>
      )}

      <section className="grid gap-3 px-4 pb-8 md:grid-cols-2 md:px-6 xl:grid-cols-3">
        {report.roles.map((role) => (
          <RoleCard key={role.id} role={role} />
        ))}
      </section>
    </main>
  );
}

export default function StackBuilderPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [router, status]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <StackBuilderContent />
    </Suspense>
  );
}
