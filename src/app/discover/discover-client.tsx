'use client';

import { useSession } from 'next-auth/react';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { PageSkeleton } from '@/components/page-skeleton';
import { RepoGrid } from '@/components/repo-grid';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useDiscoverRepos } from '@/hooks/use-discover-repos';
import type { DiscoverResponse } from '@/hooks/use-discover-repos';
import { useLists } from '@/hooks/use-lists';
import type { UserList } from '@/hooks/use-lists';
import type { Facets, SortOption, UserRepo } from '@/hooks/use-starred-repos';

const sortOptions = [
  'relevance',
  'most-stars',
  'fastest-growing',
  'recently-updated',
  'name-az',
] as const;

export default function DiscoverClient({
  initialData,
  initialUrl,
}: {
  initialData: DiscoverResponse | null;
  initialUrl: string;
}) {
  const { status } = useSession();

  if (status === 'loading') {
    return <PageSkeleton />;
  }

  return (
    <Suspense fallback={<PageSkeleton />}>
      <DiscoverContent
        isAuthenticated={status === 'authenticated'}
        initialData={initialData}
        initialUrl={initialUrl}
      />
    </Suspense>
  );
}

interface DiscoverContentProps {
  isAuthenticated: boolean;
  initialData: DiscoverResponse | null;
  initialUrl: string;
}

interface DiscoverFilters {
  searchQuery: string;
  sortBy: SortOption;
  selectedLanguages: string[];
  selectedTools: string[];
  selectedListId: number | null;
  debouncedSearch: string;
  viewMode: 'grid' | 'list';
  sidebarOpen: boolean;
  activeListId: number | null;
  hasActiveFilters: boolean;
}

interface DiscoverHandlers {
  setSearchQuery: (v: string) => void;
  setSortBy: (v: SortOption | ((old: SortOption) => SortOption)) => void;
  setSelectedLanguages: (v: string[] | ((prev: string[] | null) => string[] | null)) => void;
  setSelectedTools: (v: string[] | ((prev: string[] | null) => string[] | null)) => void;
  setSelectedListId: (v: number | null) => void;
  setViewMode: (v: 'grid' | 'list') => void;
  setSidebarOpen: (v: boolean) => void;
  handleSearchChange: (value: string) => void;
  handleLanguageToggle: (language: string) => void;
  handleToolToggle: (toolKey: string) => void;
  clearFilters: () => void;
}

interface DiscoverHandlerDeps {
  searchQuery: string;
  sortBy: SortOption;
  setSearchQuery: (v: string) => void;
  setSortBy: (v: SortOption | ((old: SortOption) => SortOption)) => void;
  setSelectedLanguages: (v: string[] | ((prev: string[] | null) => string[] | null)) => void;
  setSelectedTools: (v: string[] | ((prev: string[] | null) => string[] | null)) => void;
  setSelectedListId: (v: number | null) => void;
}

function useDiscoverHandlers(deps: DiscoverHandlerDeps) {
  const {
    searchQuery,
    sortBy,
    setSearchQuery,
    setSortBy,
    setSelectedLanguages,
    setSelectedTools,
    setSelectedListId,
  } = deps;
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedLanguages([]);
    setSelectedTools([]);
    setSelectedListId(null);
  }, [setSearchQuery, setSelectedLanguages, setSelectedTools, setSelectedListId]);

  const handleSearchChange = useCallback(
    (value: string) => {
      const wasEmpty = searchQuery.trim().length === 0;
      const isEmpty = value.trim().length === 0;
      setSearchQuery(value);
      if (wasEmpty && !isEmpty && sortBy === 'most-stars') setSortBy('relevance');
      if (!wasEmpty && isEmpty && sortBy === 'relevance') setSortBy('most-stars');
    },
    [searchQuery, setSearchQuery, setSortBy, sortBy]
  );

  const handleLanguageToggle = useCallback(
    (language: string) => {
      setSelectedLanguages((prev) =>
        (prev ?? []).includes(language)
          ? (prev ?? []).filter((l) => l !== language)
          : [...(prev ?? []), language]
      );
    },
    [setSelectedLanguages]
  );

  const handleToolToggle = useCallback(
    (toolKey: string) => {
      setSelectedTools((previous) =>
        (previous ?? []).includes(toolKey)
          ? (previous ?? []).filter((key) => key !== toolKey)
          : [...(previous ?? []), toolKey]
      );
    },
    [setSelectedTools]
  );

  return { clearFilters, handleSearchChange, handleLanguageToggle, handleToolToggle };
}

function useDiscoverFilters(
  isAuthenticated: boolean,
  initialUrl: string
): DiscoverFilters & DiscoverHandlers {
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsStringLiteral(sortOptions).withDefault(
      initialUrl.includes('q=') ? 'relevance' : 'most-stars'
    )
  );
  const [selectedLanguages, setSelectedLanguages] = useQueryState(
    'lang',
    parseAsArrayOf(parseAsString, ',').withDefault([])
  );
  const [selectedTools, setSelectedTools] = useQueryState(
    'tool',
    parseAsArrayOf(parseAsString, ',').withDefault([])
  );
  const [selectedListId, setSelectedListId] = useQueryState('list', {
    parse: (v) => (v ? parseInt(v, 10) : null),
    serialize: (v) => (v != null ? String(v) : ''),
    defaultValue: null,
  });

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const activeListId = isAuthenticated ? selectedListId : null;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!isAuthenticated && selectedListId !== null) {
      setSelectedListId(null);
    }
  }, [isAuthenticated, selectedListId, setSelectedListId]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedLanguages.length > 0 ||
    selectedTools.length > 0 ||
    activeListId !== null;

  const handlers = useDiscoverHandlers({
    searchQuery,
    sortBy,
    setSearchQuery,
    setSortBy,
    setSelectedLanguages,
    setSelectedTools,
    setSelectedListId,
  });

  return {
    searchQuery,
    sortBy,
    selectedLanguages,
    selectedTools,
    selectedListId,
    debouncedSearch,
    viewMode,
    sidebarOpen,
    activeListId,
    hasActiveFilters,
    setSearchQuery,
    setSortBy,
    setSelectedLanguages,
    setSelectedTools,
    setSelectedListId,
    setViewMode,
    setSidebarOpen,
    ...handlers,
  };
}

interface DiscoverMainContentProps {
  discoverError: unknown;
  reposLoading: boolean;
  isValidating: boolean;
  gridPending: boolean;
  isAuthenticated: boolean;
  repos: UserRepo[];
  viewMode: 'grid' | 'list';
  lists: UserList[];
  handleAssignList: (repoId: number, listId: number, assigned: boolean) => void;
  handleToggleSave: (repoId: number, saved: boolean) => void;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  mutate: () => void;
}

function DiscoverMainContent(props: DiscoverMainContentProps) {
  const {
    discoverError,
    reposLoading,
    isValidating,
    gridPending,
    isAuthenticated,
    repos,
    viewMode,
    lists,
    handleAssignList,
    handleToggleSave,
    hasActiveFilters,
    clearFilters,
    hasMore,
    loadingMore,
    loadMore,
    mutate,
  } = props;
  return (
    <ScrollArea className="flex-1">
      <main className="p-4 md:p-6">
        {discoverError && !reposLoading && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Couldn&apos;t load discover results — search may be temporarily unavailable.
            </span>
            <button
              onClick={() => mutate()}
              className="shrink-0 font-medium text-red-500 hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        <RepoGrid
          repos={repos}
          viewMode={viewMode}
          isLoading={reposLoading}
          isPending={gridPending}
          isValidating={isValidating}
          lists={isAuthenticated ? lists : undefined}
          onAssignList={isAuthenticated ? handleAssignList : undefined}
          onToggleSave={isAuthenticated ? handleToggleSave : undefined}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
        />
      </main>
    </ScrollArea>
  );
}

interface DiscoverDataAndHandlers {
  repos: UserRepo[];
  total: number;
  facets: Facets & { tools: { key: string; name: string; count: number }[] };
  discoverError: unknown;
  reposLoading: boolean;
  isValidating: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  mutate: () => void;
  lists: UserList[];
  showSidebarSkeleton: boolean;
  gridPending: boolean;
  handleAssignList: (repoId: number, listId: number, assigned: boolean) => Promise<void>;
  handleToggleSave: (repoId: number, saved: boolean) => Promise<void>;
  handleDeleteList: (id: number) => Promise<void>;
  createList: (name: string, color?: string) => Promise<unknown>;
  deleteList: (id: number) => Promise<void>;
  shareList: (id: number) => Promise<{ is_public: boolean; slug: string }>;
}

interface DiscoverDataHandlerDeps {
  selectedListId: number | null;
  setSelectedListId: (v: number | null) => void;
  assignRepoToList: (repoId: number, listId: number, assigned: boolean) => Promise<void>;
  deleteList: (id: number) => Promise<void>;
  mutate: () => void;
}

function useDiscoverDataHandlers(deps: DiscoverDataHandlerDeps) {
  const { selectedListId, setSelectedListId, assignRepoToList, deleteList, mutate } = deps;
  const handleAssignList = useCallback(
    async (repoId: number, listId: number, assigned: boolean) => {
      await assignRepoToList(repoId, listId, assigned);
      mutate();
    },
    [assignRepoToList, mutate]
  );

  const handleToggleSave = useCallback(
    async (repoId: number, saved: boolean) => {
      await fetch(`/api/repos/${repoId}/save`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saved }),
      });
      mutate();
    },
    [mutate]
  );

  const handleDeleteList = useCallback(
    async (id: number) => {
      await deleteList(id);
      if (selectedListId === id) {
        setSelectedListId(null);
      }
      mutate();
    },
    [deleteList, mutate, selectedListId, setSelectedListId]
  );

  return { handleAssignList, handleToggleSave, handleDeleteList };
}

function useDiscoverData(
  isAuthenticated: boolean,
  initialData: DiscoverResponse | null,
  initialUrl: string,
  filters: DiscoverFilters & DiscoverHandlers
): DiscoverDataAndHandlers {
  const {
    debouncedSearch,
    selectedLanguages,
    selectedTools,
    activeListId,
    sortBy,
    searchQuery,
    selectedListId,
    setSelectedListId,
  } = filters;

  const {
    repos,
    total,
    facets,
    error: discoverError,
    isLoading: reposLoading,
    isValidating,
    loadingMore,
    hasMore,
    loadMore,
    mutate,
  } = useDiscoverRepos(
    {
      q: debouncedSearch,
      language: selectedLanguages,
      listId: activeListId,
      tools: selectedTools,
      sort: sortBy,
      limit: 50,
    },
    {
      data: initialData,
      url: initialUrl,
    }
  );
  const {
    lists,
    isLoading: listsLoading,
    createList,
    deleteList,
    shareList,
    assignRepoToList,
  } = useLists(isAuthenticated);

  const requestKey = [
    debouncedSearch,
    selectedLanguages.join(','),
    selectedTools.join(','),
    activeListId ?? '',
    sortBy,
  ].join('|');
  const [settledRequestKey, setSettledRequestKey] = useState(requestKey);

  useEffect(() => {
    if (reposLoading || isValidating) return;
    const timeout = window.setTimeout(() => {
      setSettledRequestKey(requestKey);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isValidating, reposLoading, requestKey]);

  const showSidebarSkeleton =
    (reposLoading || listsLoading) && lists.length === 0 && facets.languages.length === 0;
  const gridPending =
    searchQuery !== debouncedSearch || requestKey !== settledRequestKey || isValidating;

  const { handleAssignList, handleToggleSave, handleDeleteList } = useDiscoverDataHandlers({
    selectedListId,
    setSelectedListId,
    assignRepoToList,
    deleteList,
    mutate,
  });

  return {
    repos,
    total,
    facets,
    discoverError,
    reposLoading,
    isValidating,
    loadingMore,
    hasMore,
    loadMore,
    mutate,
    lists,
    showSidebarSkeleton,
    gridPending,
    handleAssignList,
    handleToggleSave,
    handleDeleteList,
    createList,
    deleteList,
    shareList,
  };
}

function DiscoverContent(props: DiscoverContentProps) {
  const { isAuthenticated, initialData, initialUrl } = props;
  const filters = useDiscoverFilters(isAuthenticated, initialUrl);
  const {
    searchQuery,
    sortBy,
    selectedLanguages,
    selectedTools,
    selectedListId,
    viewMode,
    sidebarOpen,
    activeListId,
    hasActiveFilters,
    setSortBy,
    setSelectedListId,
    setViewMode,
    setSidebarOpen,
    handleSearchChange,
    handleLanguageToggle,
    handleToolToggle,
    clearFilters,
  } = filters;

  const data = useDiscoverData(isAuthenticated, initialData, initialUrl, filters);
  const {
    repos,
    total,
    facets,
    discoverError,
    reposLoading,
    isValidating,
    loadingMore,
    hasMore,
    loadMore,
    mutate,
    lists,
    showSidebarSkeleton,
    gridPending,
    handleAssignList,
    handleToggleSave,
    handleDeleteList,
    createList,
    shareList,
  } = data;

  const sidebarContent = (
    <Sidebar
      languageFacets={facets.languages}
      listFacets={facets.lists}
      isLoading={showSidebarSkeleton}
      selectedLanguages={selectedLanguages}
      onLanguageToggle={handleLanguageToggle}
      toolFacets={facets.tools}
      selectedTools={selectedTools}
      onToolToggle={handleToolToggle}
      lists={lists}
      selectedListId={activeListId}
      onListSelect={setSelectedListId}
      onCreateList={createList}
      onDeleteList={handleDeleteList}
      onShareList={shareList}
      collectionsEnabled={isAuthenticated}
    />
  );

  return (
    <>
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        sortBy={sortBy}
        onSortChange={(sort) => {
          if (sort !== 'recently-starred') setSortBy(sort);
        }}
        sortOptions={sortOptions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onMenuClick={() => setSidebarOpen(true)}
        repoCount={total}
        repoCountDescription="This count shows repositories matching your current search and filters. Discover starts with public GitHub repositories at 5,000+ stars, added and refreshed by a bounded daily job."
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[280px] shrink-0 border-r md:block">{sidebarContent}</aside>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetTitle className="sr-only">Filters</SheetTitle>
            <SheetDescription className="sr-only">
              Filter seeded repositories by language, detected tool, and collection.
            </SheetDescription>
            {sidebarContent}
          </SheetContent>
        </Sheet>

        <DiscoverMainContent
          discoverError={discoverError}
          reposLoading={reposLoading}
          isValidating={isValidating}
          gridPending={gridPending}
          isAuthenticated={isAuthenticated}
          repos={repos}
          viewMode={viewMode}
          lists={lists}
          handleAssignList={handleAssignList}
          handleToggleSave={handleToggleSave}
          hasActiveFilters={hasActiveFilters}
          clearFilters={clearFilters}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMore={loadMore}
          mutate={mutate}
        />
      </div>
    </>
  );
}
