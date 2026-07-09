'use client';

import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Info,
  Languages,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

type ToolScope = 'discover' | 'user' | 'all';

interface ToolSummary {
  toolKey: string;
  toolName: string;
  category: string;
  url: string;
  repoCount: number;
  avgConfidence: number;
  maxConfidence: number;
}

interface ToolRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  tool: {
    toolName: string;
    category: string;
    url: string;
    confidence: number;
    sources: string[];
  };
}

interface LanguageFacet {
  language: string;
  repoCount: number;
}

interface ToolReposResponse {
  scope: ToolScope;
  disclaimer: string;
  languages: string[];
  languageFacets: LanguageFacet[];
  tool: ToolSummary;
  repos: ToolRepo[];
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
}

function confidenceLabel(value: number): string {
  if (value >= 90) return 'High confidence';
  if (value >= 65) return 'Medium confidence';
  return 'Inferred';
}

function confidenceClass(value: number): string {
  if (value >= 90)
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (value >= 65) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

export default function ToolDetailPage() {
  const params = useParams<{ toolKey: string }>();
  const { status } = useSession();
  const [scope, setScope] = useState<ToolScope>('discover');
  const [minConfidence, setMinConfidence] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const toolKey = Array.isArray(params.toolKey) ? params.toolKey[0] : params.toolKey;
  const decodedToolKey = decodeURIComponent(toolKey ?? '');
  const languageQuery =
    selectedLanguages.length > 0
      ? `&languages=${selectedLanguages.map(encodeURIComponent).join(',')}`
      : '';
  const apiUrl = `/api/tools?scope=${scope}&min_confidence=${minConfidence}&min_stars=10000&tool=${encodeURIComponent(decodedToolKey)}&limit=500${languageQuery}`;
  const { data, error, isLoading } = useSWR<ToolReposResponse>(apiUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const toggleLanguage = (language: string) => {
    setSelectedLanguages((current) =>
      current.includes(language)
        ? current.filter((selected) => selected !== language)
        : [...current, language]
    );
  };

  const repos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data?.repos ?? [];
    return (data?.repos ?? []).filter(
      (repo) =>
        repo.full_name.toLowerCase().includes(q) ||
        repo.description?.toLowerCase().includes(q) ||
        repo.language?.toLowerCase().includes(q)
    );
  }, [data?.repos, query]);

  const isAuthenticated = status === 'authenticated';
  const tool = data?.tool;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/tools">
                <ArrowLeft className="size-4" />
                Tools
              </Link>
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {tool?.toolName ?? decodedToolKey}
                </h1>
                {tool && (
                  <Badge variant="outline" className={confidenceClass(tool.avgConfidence)}>
                    {confidenceLabel(tool.avgConfidence)}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Repositories where Starboard detected this tool, framework, language, or platform.
              </p>
            </div>
          </div>
          {tool?.url && (
            <Button asChild variant="outline" size="sm">
              <Link href={tool.url} target="_blank" rel="noreferrer">
                Tool link
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      <section className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-semibold">{formatNumber(tool?.repoCount ?? 0)}</div>
            <div className="text-sm text-muted-foreground">matching repositories</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-semibold">{tool?.avgConfidence ?? 0}%</div>
            <div className="text-sm text-muted-foreground">average confidence</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-semibold">{tool?.category ?? 'tool'}</div>
            <div className="text-sm text-muted-foreground">category</div>
          </div>
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>{data?.disclaimer}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['discover', 'user', 'all'] as const).map((value) => (
              <Button
                key={value}
                variant={scope === value ? 'default' : 'outline'}
                size="sm"
                disabled={value === 'user' && !isAuthenticated}
                onClick={() => setScope(value)}
              >
                {value === 'discover' ? '10k+ corpus' : value === 'user' ? 'My library' : 'All'}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:min-w-[640px]">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter repositories..."
                className="pl-9"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="justify-start gap-2">
                  <Languages className="size-4" />
                  Language
                  {selectedLanguages.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {selectedLanguages.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {(data?.languageFacets ?? []).map((facet) => (
                  <DropdownMenuCheckboxItem
                    key={facet.language}
                    checked={selectedLanguages.includes(facet.language)}
                    onCheckedChange={() => toggleLanguage(facet.language)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    <span className="min-w-0 flex-1 truncate">{facet.language}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(facet.repoCount)}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
                {data?.languageFacets?.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No languages detected
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant={minConfidence >= 90 ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setMinConfidence((value) => (value >= 90 ? 0 : 90))}
            >
              <ShieldCheck className="size-4" />
              High confidence
            </Button>
          </div>
        </div>

        {selectedLanguages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedLanguages.map((language) => (
              <Badge key={language} variant="secondary" className="gap-1 pr-1">
                {language}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-5"
                  aria-label={`Remove ${language} filter`}
                  onClick={() => toggleLanguage(language)}
                >
                  <X className="size-3" />
                </Button>
              </Badge>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedLanguages([])}
            >
              Clear languages
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            Tool repositories could not load.
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <Card key={index} className="h-40 rounded-lg py-4 shadow-none" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {repos.map((repo) => (
              <Card key={repo.id} className="rounded-lg py-4 shadow-none">
                <CardContent className="space-y-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/explore/${repo.full_name}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {repo.full_name}
                      </Link>
                      {repo.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {repo.description}
                        </p>
                      )}
                    </div>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Open ${repo.full_name} on GitHub`}
                    >
                      <Link href={repo.html_url} target="_blank" rel="noreferrer">
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={confidenceClass(repo.tool.confidence)}>
                      {repo.tool.confidence}% confidence
                    </Badge>
                    {repo.language && <Badge variant="secondary">{repo.language}</Badge>}
                    <Badge variant="secondary">{formatNumber(repo.stargazers_count)} stars</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {repo.tool.sources.slice(0, 4).map((source) => (
                      <Badge key={source} variant="outline" className="text-xs">
                        {source}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
