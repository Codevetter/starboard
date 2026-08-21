'use client';

import {
  ArrowUpDown,
  Check,
  Database,
  FolderKanban,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Menu,
  Info,
  RefreshCw,
  Search,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { SortOption } from '@/hooks/use-starred-repos';
import { getAvatarImageAttrs } from '@/lib/avatar';

const sortLabels: Record<SortOption, string> = {
  relevance: 'Relevance',
  'recently-starred': 'Recently Starred',
  'most-stars': 'Stars',
  'fastest-growing': 'Fastest Growing',
  'recently-updated': 'Last Updated',
  'name-az': 'Name A-Z',
};

export { sortLabels };

export interface NavigationItem {
  href: string;
  label: string;
  icon: typeof Database;
  active: boolean;
}

export function buildNavigationItems(
  pathname: string | null,
  isAuthenticated: boolean
): NavigationItem[] {
  const isDiscover = pathname?.startsWith('/discover') ?? false;
  const isProjects = pathname?.startsWith('/projects') ?? false;
  const isTools = pathname?.startsWith('/tools') ?? false;
  return [
    { href: '/discover', label: 'Discover', icon: Database, active: isDiscover, visible: true },
    {
      href: '/projects',
      label: 'Projects',
      icon: FolderKanban,
      active: isProjects,
      visible: isAuthenticated,
    },
    { href: '/tools', label: 'Tools', icon: Wrench, active: isTools, visible: true },
    {
      href: '/stars',
      label: 'Library',
      icon: Star,
      active: !isDiscover && !isProjects && !isTools,
      visible: isAuthenticated,
    },
  ]
    .filter((item) => item.visible)
    .map(({ visible: _visible, ...rest }) => rest);
}

export function SearchBar({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search repos..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}

export function TitleBlock({ title, description }: { title?: string; description?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-sm font-semibold">{title}</h1>
      {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

export function NavigationDropdown({ items }: { items: NavigationItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 sm:hidden"
          aria-label="Open product navigation"
        >
          <Menu className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 sm:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild className={item.active ? 'bg-accent' : ''}>
              <Link href={item.href} prefetch={false}>
                <Icon className="size-4" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NavigationLinks({ items }: { items: NavigationItem[] }) {
  return (
    <div className="hidden shrink-0 items-center rounded-md border p-0.5 sm:flex">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.href}
            asChild
            variant={item.active ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <Link href={item.href} prefetch={false}>
              <Icon className="size-3.5" />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

export function RepoCountDisplay({
  repoCount,
  repoCountDescription,
}: {
  repoCount: number;
  repoCountDescription?: string;
}) {
  if (repoCountDescription) {
    return (
      <button
        type="button"
        aria-label={`${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}; how Discover selects repositories`}
        aria-describedby="repository-count-explanation"
        className="group relative hidden shrink-0 items-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground lg:inline-flex"
      >
        {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
        <Info className="size-3.5" aria-hidden="true" />
        <span
          id="repository-count-explanation"
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 rounded-md border bg-popover p-3 text-left text-xs leading-relaxed text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {repoCountDescription}
        </span>
      </button>
    );
  }
  return (
    <span className="hidden shrink-0 text-sm text-muted-foreground lg:inline">
      {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
    </span>
  );
}

export function SyncButton({ syncing, onSync }: { syncing?: boolean; onSync: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={`shrink-0 gap-1.5 text-xs transition-all${syncing ? ' border-primary/50 text-primary' : ''}`}
      onClick={onSync}
      disabled={syncing}
    >
      {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync'}</span>
    </Button>
  );
}

export function ClearFiltersButton({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5 text-xs"
      onClick={onClearFilters}
    >
      <X className="size-3" />
      <span className="hidden sm:inline">Clear filters</span>
      <span className="sm:hidden">Clear</span>
    </Button>
  );
}

export function SortDropdown({
  sortBy,
  onSortChange,
  sortOptions,
}: {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  sortOptions?: readonly SortOption[];
}) {
  const visibleSortOptions = sortOptions ?? (Object.keys(sortLabels) as SortOption[]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden gap-2 sm:flex">
          <ArrowUpDown className="size-3.5" />
          <span className="hidden md:inline">{sortLabels[sortBy]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {visibleSortOptions.map((value) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onSortChange(value)}
            className="justify-between"
          >
            {sortLabels[value]}
            {sortBy === value && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ViewModeToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={viewMode}
      onValueChange={(v) => {
        if (v) onViewModeChange(v as 'grid' | 'list');
      }}
      variant="outline"
      size="sm"
      className="hidden sm:flex"
    >
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <LayoutGrid className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List view">
        <List className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function UserAvatar({ session }: { session: NonNullable<ReturnType<typeof useSession>['data']> }) {
  const userAvatar = session.user?.image ? getAvatarImageAttrs(session.user.image, 32) : null;
  if (session.user?.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={userAvatar!.src}
        srcSet={userAvatar!.srcSet}
        sizes={userAvatar!.sizes}
        alt={session.user.name ?? 'User'}
        className="size-8 rounded-full"
        width={32}
        height={32}
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
    );
  }
  return (
    <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
      {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status !== 'authenticated') {
    return (
      <Button asChild size="sm" className="shrink-0">
        <Link href="/">Connect GitHub</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 overflow-hidden rounded-full sm:size-9"
        >
          <UserAvatar session={session} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{session?.user?.name}</p>
          <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/' })}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
