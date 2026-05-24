"use client";

import {
  ArrowUpRight,
  Check,
  GitBranch,
  Loader2,
  MoreHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type DigestItemAction,
  trackDigestItemActioned,
  trackDigestOpened,
} from "@/lib/analytics";
import type {
  DigestGroup,
  DigestItem,
  MaintainerDigest,
} from "@/lib/maintainer-digest";

type LocalDigestAction = DigestItemAction;
type LocalDigestState = Record<string, LocalDigestAction>;
type LocalDigestStateById = {
  digestId: string | null;
  actions: LocalDigestState;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

function localStorageKey(digestId: string): string {
  return `starboard.weeklyDigest.${digestId}.actions`;
}

function readLocalDigestState(digestId: string): LocalDigestState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(localStorageKey(digestId));
    return raw ? (JSON.parse(raw) as LocalDigestState) : {};
  } catch {
    return {};
  }
}

function priorityVariant(priority: DigestItem["priority"]): "default" | "secondary" | "destructive" | "outline" {
  if (priority === "urgent") return "destructive";
  if (priority === "watch") return "secondary";
  return "outline";
}

function actionLabel(action: LocalDigestAction | undefined): string | null {
  if (action === "reviewed") return "Reviewed";
  if (action === "dismissed") return "Dismissed";
  return null;
}

function DigestItemRow({
  digestId,
  item,
  action,
  onAction,
}: {
  digestId: string;
  item: DigestItem;
  action?: LocalDigestAction;
  onAction: (item: DigestItem, action: LocalDigestAction) => void;
}) {
  const stateLabel = actionLabel(action);

  return (
    <div className="grid gap-3 border-t py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={item.starboardUrl}
            className="truncate text-sm font-medium hover:underline"
          >
            {item.title}
          </Link>
          <Badge variant={priorityVariant(item.priority)} className="text-[10px]">
            {item.actionLabel}
          </Badge>
          {stateLabel && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {stateLabel}
            </Badge>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {item.description}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="xs">
            <Link href={item.starboardUrl}>
              <MoreHorizontal className="size-3" />
              Starboard
            </Link>
          </Button>
          <Button asChild variant="ghost" size="xs">
            <Link href={item.sourceUrl} target="_blank" rel="noreferrer">
              <GitBranch className="size-3" />
              GitHub
              <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:self-start">
        <Button
          variant={action === "reviewed" ? "secondary" : "outline"}
          size="xs"
          onClick={() => onAction(item, "reviewed")}
          aria-label={`Mark ${item.fullName} reviewed in digest ${digestId}`}
        >
          <Check className="size-3" />
          Reviewed
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onAction(item, "dismissed")}
          aria-label={`Dismiss ${item.fullName} from digest ${digestId}`}
          title="Dismiss"
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function DigestGroupSection({
  digestId,
  group,
  actions,
  onAction,
}: {
  digestId: string;
  group: DigestGroup;
  actions: LocalDigestState;
  onAction: (item: DigestItem, action: LocalDigestAction) => void;
}) {
  const visibleItems = group.items.filter((item) => actions[item.id] !== "dismissed");

  if (group.items.length === 0 || visibleItems.length === 0) {
    return null;
  }

  return (
    <section className="min-w-0">
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{group.title}</h3>
          <Badge variant="outline" className="text-[10px]">
            {visibleItems.length}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
      </div>
      <div className="rounded-md border bg-background px-3">
        {visibleItems.map((item) => (
          <DigestItemRow
            key={item.id}
            digestId={digestId}
            item={item}
            action={actions[item.id]}
            onAction={onAction}
          />
        ))}
      </div>
    </section>
  );
}

export function WeeklyActionDigest() {
  const { data, error, isLoading } = useSWR<MaintainerDigest>(
    "/api/digest/weekly",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5 * 60_000,
    }
  );
  const [localActions, setLocalActions] = useState<LocalDigestStateById>({
    digestId: null,
    actions: {},
  });
  const digestId = data?.id;
  const persistedActions = useMemo(
    () => (digestId ? readLocalDigestState(digestId) : {}),
    [digestId]
  );
  const actions =
    data && localActions.digestId === data.id
      ? localActions.actions
      : persistedActions;

  useEffect(() => {
    if (!data) return;
    const openKey = `starboard.weeklyDigest.${data.id}.opened`;
    try {
      if (window.sessionStorage.getItem(openKey)) return;
      window.sessionStorage.setItem(openKey, "1");
    } catch {
      // Analytics should still attempt to fire if storage is unavailable.
    }
    trackDigestOpened(data.id, data.summary.totalItems);
  }, [data]);

  const visibleCount = useMemo(() => {
    if (!data) return 0;
    return data.groups.reduce(
      (sum, group) =>
        sum + group.items.filter((item) => actions[item.id] !== "dismissed").length,
      0
    );
  }, [actions, data]);

  const handleAction = (item: DigestItem, action: LocalDigestAction) => {
    if (!data) return;
    setLocalActions((current) => {
      const base =
        current.digestId === data.id ? current.actions : persistedActions;
      const next = { ...base, [item.id]: action };
      try {
        window.localStorage.setItem(localStorageKey(data.id), JSON.stringify(next));
      } catch {
        // Local review state is best-effort.
      }
      return { digestId: data.id, actions: next };
    });
    trackDigestItemActioned(data.id, item.id, item.group, action);
  };

  if (isLoading) {
    return (
      <section className="mb-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your weekly action digest
        </div>
      </section>
    );
  }

  if (error || !data) {
    return null;
  }

  if (data.summary.totalItems === 0) {
    return null;
  }

  return (
    <section className="mb-4 rounded-lg border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Your Weekly Action Digest</h2>
            <Badge variant="secondary" className="text-xs">
              {visibleCount} open
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Opportunities, risks, and suggested next actions from your library.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-1 text-center text-xs">
          <div className="rounded-md border px-2 py-1.5">
            <div className="font-medium">{data.summary.newlyStarred}</div>
            <div className="text-muted-foreground">New</div>
          </div>
          <div className="rounded-md border px-2 py-1.5">
            <div className="font-medium">{data.summary.recentReleases}</div>
            <div className="text-muted-foreground">Releases</div>
          </div>
          <div className="rounded-md border px-2 py-1.5">
            <div className="font-medium">{data.summary.highMomentum}</div>
            <div className="text-muted-foreground">Growth</div>
          </div>
          <div className="rounded-md border px-2 py-1.5">
            <div className="font-medium">{data.summary.atRisk}</div>
            <div className="text-muted-foreground">At Risk</div>
          </div>
          <div className="rounded-md border px-2 py-1.5">
            <div className="font-medium">{data.summary.suggestedActions}</div>
            <div className="text-muted-foreground">Actions</div>
          </div>
        </div>
      </div>

      {visibleCount === 0 ? (
        <div className="mt-4 rounded-md border bg-background p-3 text-sm text-muted-foreground">
          Digest clear.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.groups.map((group) => (
            <DigestGroupSection
              key={group.id}
              digestId={data.id}
              group={group}
              actions={actions}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </section>
  );
}
