"use client";

import { Bookmark, GitCompare, Search, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ActiveFilterChips } from "@/components/active-filter-chips";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { CompareSheet } from "@/components/compare-sheet";
import { RepoGrid } from "@/components/repo-grid";
import { Sidebar } from "@/components/sidebar";
import { SyncAnimation, SyncProgressBar } from "@/components/sync-animation";
import { TopBar } from "@/components/top-bar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { WeeklyActionDigest } from "@/components/weekly-maintainer-digest";
import { useLists } from "@/hooks/use-lists";
import { useStarredRepos } from "@/hooks/use-starred-repos";

const sortOptions = ["relevance", "recently-starred", "most-stars", "recently-updated", "name-az"] as const;

function PageSkeleton() {
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-sm md:px-6">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="hidden h-8 w-36 rounded-md sm:block" />
        <Skeleton className="hidden h-8 w-20 rounded-md sm:block" />
        <Skeleton className="size-8 rounded-full" />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[280px] shrink-0 border-r md:block">
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 3 }).map((_, section) => (
              <div key={section}>
                <div className="flex items-center gap-2 px-2 py-1">
                  <Skeleton className="size-4" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                      <Skeleton className="h-3 flex-1" />
                      <Skeleton className="h-3 w-6" />
                    </div>
                  ))}
                </div>
                {section < 2 && <div className="my-3 h-px bg-border" />}
              </div>
            ))}
          </div>
        </aside>

        <div className="flex-1 p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col rounded-lg border bg-card p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-4 w-36" />
                </div>
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-1.5 h-3 w-3/4" />
                <div className="mt-auto pt-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function StarsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StarsContent />
    </Suspense>
  );
}

function StarsContent() {
  const { status } = useSession();
  const router = useRouter();

  if (status === "unauthenticated") {
    router.replace("/");
  }

  // URL-synced filter state via nuqs
  const [searchQuery, setSearchQuery] = useQueryState("q", parseAsString.withDefault(""));
  const [sortBy, setSortBy] = useQueryState("sort", parseAsStringLiteral(sortOptions).withDefault("recently-starred"));
  const [selectedLanguages, setSelectedLanguages] = useQueryState("lang", parseAsArrayOf(parseAsString, ",").withDefault([]));
  const [selectedListId, setSelectedListId] = useQueryState("list", {
    parse: (v) => (v ? parseInt(v, 10) : null),
    serialize: (v) => (v != null ? String(v) : ""),
    defaultValue: null,
  });

  // Local-only state
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [selectedByFilter, setSelectedByFilter] = useState<{
    filterKey: string;
    ids: Set<number>;
  }>(() => ({ filterKey: "", ids: new Set() }));
  const [compareRequested, setCompareRequested] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const filterKey = [
    debouncedSearch,
    selectedLanguages.join(","),
    selectedListId ?? "",
    sortBy,
  ].join("|");
  const selectedRepoIds =
    selectedByFilter.filterKey === filterKey ? selectedByFilter.ids : new Set<number>();
  const compareOpen = compareRequested && selectedRepoIds.size >= 2;

  // Data hooks
  const { repos, total, facets, isLoading: reposLoading, isValidating, loadingMore, hasMore, loadMore, syncing, sync, syncResult, syncError, dismissSyncResult, dismissSyncError, mutate } = useStarredRepos({
    q: debouncedSearch,
    language: selectedLanguages,
    listId: selectedListId,
    sort: sortBy,
    limit: 50,
  });
  const { lists, isLoading: listsLoading, createList, deleteList, shareList, assignRepoToList } = useLists();
  const requestKey = [
    debouncedSearch,
    selectedLanguages.join(","),
    selectedListId ?? "",
    sortBy,
  ].join("|");
  const [settledRequestKey, setSettledRequestKey] = useState(requestKey);

  useEffect(() => {
    if (reposLoading || isValidating) return;
    const timeout = window.setTimeout(() => {
      setSettledRequestKey(requestKey);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isValidating, reposLoading, requestKey]);

  const showSidebarSkeleton =
    (reposLoading || listsLoading) &&
    lists.length === 0 &&
    facets.languages.length === 0;

  const hasActiveFilters = searchQuery.trim().length > 0 || selectedLanguages.length > 0 || selectedListId !== null;
  const isGridPending =
    searchQuery !== debouncedSearch ||
    requestKey !== settledRequestKey ||
    isValidating;

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedLanguages([]);
    setSelectedListId(null);
  }, [setSearchQuery, setSelectedLanguages, setSelectedListId]);

  const handleLanguageToggle = useCallback((language: string) => {
    setSelectedLanguages((prev) =>
      (prev ?? []).includes(language)
        ? (prev ?? []).filter((l) => l !== language)
        : [...(prev ?? []), language]
    );
  }, [setSelectedLanguages]);

  const handleListSelect = useCallback((id: number | null) => {
    setSelectedListId(id);
  }, [setSelectedListId]);

  const handleAssignList = useCallback(async (repoId: number, listId: number, assigned: boolean) => {
    await assignRepoToList(repoId, listId, assigned);
    mutate();
  }, [assignRepoToList, mutate]);

  const handleToggleSave = useCallback(async (repoId: number, saved: boolean) => {
    await fetch(`/api/repos/${repoId}/save`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved }),
    });
    mutate();
  }, [mutate]);

  const handleToggleSelect = useCallback(
    (repoId: number, selected: boolean) => {
      setSelectedByFilter((prev) => {
        const ids =
          prev.filterKey === filterKey ? new Set(prev.ids) : new Set<number>();
        if (selected) ids.add(repoId);
        else ids.delete(repoId);
        return { filterKey, ids };
      });
    },
    [filterKey]
  );

  const selectedRepos = useMemo(
    () => repos.filter((repo) => selectedRepoIds.has(repo.id)),
    [repos, selectedRepoIds]
  );
  const selectedCount = selectedRepoIds.size;
  const allSelectedSaved =
    selectedRepos.length > 0 && selectedRepos.every((repo) => Boolean(repo.is_saved));
  const noneSelectedSaved =
    selectedRepos.length > 0 && selectedRepos.every((repo) => !repo.is_saved);

  const handleBulkSave = useCallback(async () => {
    const targets = selectedRepos.filter((repo) => !repo.is_saved);
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        targets.map((repo) =>
          fetch(`/api/repos/${repo.id}/save`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ saved: true }),
          })
        )
      );
      mutate();
    } finally {
      setBulkBusy(false);
    }
  }, [mutate, selectedRepos]);

  const handleBulkUnsave = useCallback(async () => {
    const targets = selectedRepos.filter((repo) => repo.is_saved);
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        targets.map((repo) =>
          fetch(`/api/repos/${repo.id}/save`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ saved: false }),
          })
        )
      );
      mutate();
    } finally {
      setBulkBusy(false);
    }
  }, [mutate, selectedRepos]);

  const handleBulkAssignToList = useCallback(async (listId: number) => {
    if (selectedRepos.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        selectedRepos
          .filter((repo) => !(repo.collection_ids ?? []).includes(listId))
          .map((repo) => assignRepoToList(repo.id, listId, true))
      );
      mutate();
    } finally {
      setBulkBusy(false);
    }
  }, [assignRepoToList, mutate, selectedRepos]);

  const handleCompare = useCallback(() => {
    if (selectedCount >= 2) setCompareRequested(true);
  }, [selectedCount]);

  const handleClearSelection = useCallback(() => {
    setSelectedByFilter({ filterKey, ids: new Set() });
    setCompareRequested(false);
  }, [filterKey]);

  const handleCompareDeselect = useCallback(
    (repoId: number) => {
      setSelectedByFilter((prev) => {
        const ids =
          prev.filterKey === filterKey ? new Set(prev.ids) : new Set<number>();
        ids.delete(repoId);
        return { filterKey, ids };
      });
    },
    [filterKey]
  );

  const handleRemoveLanguage = useCallback(
    (language: string) => {
      setSelectedLanguages((prev) => (prev ?? []).filter((lang) => lang !== language));
    },
    [setSelectedLanguages]
  );

  const handleDeleteList = useCallback(async (id: number) => {
    await deleteList(id);
    if (selectedListId === id) {
      setSelectedListId(null);
    }
    mutate();
  }, [deleteList, mutate, selectedListId, setSelectedListId]);

  if (status === "loading") {
    return <PageSkeleton />;
  }

  if (status === "unauthenticated") {
    return null;
  }

  const sidebarContent = (
    <Sidebar
      languageFacets={facets.languages}
      listFacets={facets.lists}
      isLoading={showSidebarSkeleton}
      selectedLanguages={selectedLanguages}
      onLanguageToggle={handleLanguageToggle}
      lists={lists}
      selectedListId={selectedListId}
      onListSelect={handleListSelect}
      onCreateList={createList}
      onDeleteList={handleDeleteList}
      onShareList={shareList}
    />
  );

  return (
    <>
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOptions={sortOptions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onMenuClick={() => setSidebarOpen(true)}
        repoCount={total}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        syncing={syncing}
        onSync={sync}
      />

      {/* Progress bar for syncs when repos already loaded */}
      {syncing && total > 0 && <SyncProgressBar />}

      {syncError && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm">
              <p className="font-medium text-red-500">Sync failed</p>
              <p className="mt-1 text-muted-foreground">{syncError}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={sync}
                disabled={syncing}
                className="text-sm font-medium text-red-500 hover:underline disabled:opacity-50"
              >
                Retry
              </button>
              <button
                onClick={dismissSyncError}
                className="text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </div>
          </div>
        </div>
      )}

      {syncResult && !syncResult.unchanged && (
        <div
          className="border-b bg-card px-4 py-3 md:px-6"
          style={{ animation: "slideDown 0.3s ease both" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm">
              <p className="font-medium">Sync complete</p>
              {syncResult.added.length > 0 && (
                <p className="mt-1 text-green-500">
                  +{syncResult.added.length} new: {syncResult.added.map((r) => r.full_name).join(", ")}
                </p>
              )}
              {syncResult.removed.length > 0 && (
                <p className="mt-1 text-red-400">
                  -{syncResult.removed.length} removed: {syncResult.removed.map((r) => r.full_name).join(", ")}
                </p>
              )}
              {syncResult.importedLists.length > 0 && (
                <p className="mt-1 text-sky-500">
                  Imported {syncResult.importedLists.length} GitHub collections: {syncResult.importedLists.join(", ")}
                </p>
              )}
              {syncResult.assignedRepos > 0 && (
                <p className="mt-1 text-sky-500">
                  Assigned {syncResult.assignedRepos} repos to imported GitHub collections.
                </p>
              )}
              {syncResult.unchanged && (
                <p className="mt-1 text-muted-foreground">Everything up to date</p>
              )}
            </div>
            <button
              onClick={dismissSyncResult}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              &times;
            </button>
          </div>
          <style>{`
            @keyframes slideDown {
              from { opacity: 0; transform: translateY(-8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* Initial import: full animated screen */}
      {!reposLoading && total === 0 && !hasActiveFilters && syncing && (
        <SyncAnimation />
      )}
      {!reposLoading && total === 0 && !hasActiveFilters && !syncing && (
        <EmptyState onSync={sync} syncing={syncing} />
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[280px] shrink-0 border-r md:block">
          {sidebarContent}
        </aside>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetTitle className="sr-only">Filters</SheetTitle>
            <SheetDescription className="sr-only">
              Filter library repositories by language and collection.
            </SheetDescription>
            {sidebarContent}
          </SheetContent>
        </Sheet>

        <ScrollArea className="flex-1">
          <main className="p-4 md:p-6">
            <WeeklyActionDigest />
            <ActiveFilterChips
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery("")}
              selectedLanguages={selectedLanguages}
              onRemoveLanguage={handleRemoveLanguage}
              selectedListId={selectedListId}
              lists={lists}
              onClearList={() => setSelectedListId(null)}
              onClearAll={clearFilters}
            />
            <RepoGrid
              repos={repos}
              viewMode={viewMode}
              isLoading={reposLoading}
              isPending={isGridPending}
              isValidating={isValidating}
              lists={lists}
              onAssignList={handleAssignList}
              onToggleSave={handleToggleSave}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              selectedRepoIds={selectedRepoIds}
              onToggleSelect={handleToggleSelect}
              selectionActive={selectedCount > 0}
            />
          </main>
        </ScrollArea>
      </div>

      <BulkActionBar
        selectedCount={selectedCount}
        onClear={handleClearSelection}
        onSaveAll={handleBulkSave}
        onUnsaveAll={handleBulkUnsave}
        onCompare={handleCompare}
        onAssignToList={handleBulkAssignToList}
        lists={lists}
        busy={bulkBusy}
        allSaved={allSelectedSaved}
        noneSaved={noneSelectedSaved}
      />

      <CompareSheet
        open={compareOpen}
        onOpenChange={setCompareRequested}
        repos={selectedRepos}
        onDeselect={handleCompareDeselect}
      />
    </>
  );
}

function EmptyState({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="flex max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Your GitHub stars, organized and searchable.
        </h1>
        <p className="max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          Stop losing track of interesting repos. Starboard turns your
          stars into a personal, searchable library so you can find what
          you need, when you need it.
        </p>

        <ul className="grid w-full max-w-md gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <HeroPoint icon={<Search className="size-4" />}>
            Ask in plain English, not by keyword
          </HeroPoint>
          <HeroPoint icon={<GitCompare className="size-4" />}>
            Compare repos side-by-side
          </HeroPoint>
          <HeroPoint icon={<Bookmark className="size-4" />}>
            Save into your own collections
          </HeroPoint>
          <HeroPoint icon={<span className="text-base leading-none">★</span>}>
            Track activity on what you starred
          </HeroPoint>
        </ul>

        <div className="flex w-full flex-col items-center gap-4 pt-2">
          <button
            onClick={onSync}
            disabled={syncing}
            className="h-11 rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Sync stars
          </button>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/discover"
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              or browse public repos →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroPoint({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border bg-card/60 px-3 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="text-foreground/90">{children}</span>
    </li>
  );
}
