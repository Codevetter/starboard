"use client";

import {
  ArrowUpRight,
  Boxes,
  Brain,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  Layers3,
  Loader2,
  Server,
  Smartphone,
  TestTube2,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StackBuilderReport, StackCandidate, StackLaneId } from "@/lib/stack-builder";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

function laneIcon(lane: StackLaneId) {
  if (lane === "frontend") return <Code2 className="size-4" />;
  if (lane === "backend") return <Server className="size-4" />;
  if (lane === "database") return <Database className="size-4" />;
  if (lane === "ai") return <Brain className="size-4" />;
  if (lane === "infrastructure") return <Cloud className="size-4" />;
  if (lane === "testing") return <TestTube2 className="size-4" />;
  if (lane === "mobile") return <Smartphone className="size-4" />;
  return <Wrench className="size-4" />;
}

function CandidateBlock({
  candidate,
  compact = false,
}: {
  candidate: StackCandidate;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "rounded-md border p-2" : "rounded-md border bg-background/60 p-3"}>
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
        <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${candidate.fullName} on GitHub`}>
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
        {candidate.archived && (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
            archived
          </Badge>
        )}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidate.reasons.slice(0, 3).map((reason) => (
            <Badge key={reason} variant="outline" className="text-xs text-muted-foreground">
              {reason}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function LaneCard({ lane }: { lane: StackBuilderReport["lanes"][number] }) {
  return (
    <Card className="rounded-lg py-4 shadow-none">
      <CardHeader className="gap-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge variant="outline" className="gap-1.5">
              {laneIcon(lane.id)}
              {lane.label}
            </Badge>
            <CardTitle className="mt-3 text-base">
              {lane.selected ? lane.selected.name : "No strong match yet"}
            </CardTitle>
          </div>
          {lane.selected && (
            <CheckCircle2 className="size-5 text-emerald-500" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <p className="min-h-10 text-sm text-muted-foreground">{lane.summary}</p>
        {lane.selected ? (
          <CandidateBlock candidate={lane.selected} />
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Star or save repos with related topics to fill this lane.
          </div>
        )}
        {lane.alternatives.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              Alternatives
            </div>
            {lane.alternatives.map((candidate) => (
              <CandidateBlock key={candidate.id} candidate={candidate} compact />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StackBuilderPage() {
  const { status } = useSession();
  const router = useRouter();
  const { data, error, isLoading } = useSWR<StackBuilderReport>("/api/stack-builder", fetcher, {
    revalidateOnFocus: false,
  });

  if (status === "unauthenticated") {
    router.replace("/");
  }

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  const report = data ?? {
    lanes: [],
    summary: { totalRepos: 0, coveredLanes: 0, archivedCandidates: 0, topLanguages: [] },
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
              <p className="text-sm text-muted-foreground">Compose a pragmatic app stack from your starred repositories.</p>
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

      <section className="grid gap-3 p-4 md:grid-cols-4 md:p-6">
        <Card className="rounded-lg py-4 shadow-none">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold">{report.summary.totalRepos}</div>
            <div className="text-sm text-muted-foreground">starred repos scanned</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg py-4 shadow-none">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold">{report.summary.coveredLanes}</div>
            <div className="text-sm text-muted-foreground">stack lanes covered</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg py-4 shadow-none md:col-span-2">
          <CardContent className="px-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Layers3 className="size-4" />
              Top languages
            </div>
            <div className="flex flex-wrap gap-1.5">
              {report.summary.topLanguages.length > 0 ? (
                report.summary.topLanguages.map(([language, count]) => (
                  <Badge key={language} variant="secondary">
                    {language} · {count}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Sync stars to build language coverage.</span>
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
        {report.lanes.map((lane) => (
          <LaneCard key={lane.id} lane={lane} />
        ))}
      </section>
    </main>
  );
}
