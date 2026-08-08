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
  PanelLeft,
  RefreshCw,
  Search,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

interface TopBarProps {
  title?: string;
  description?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  sortBy?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  sortOptions?: readonly SortOption[];
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  onMenuClick?: () => void;
  repoCount?: number;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  syncing?: boolean;
  onSync?: () => void;
}

export function TopBar({
  title,
  description,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  sortOptions,
  viewMode,
  onViewModeChange,
  onMenuClick,
  repoCount,
  hasActiveFilters,
  onClearFilters,
  syncing,
  onSync,
}: TopBarProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isDiscover = pathname?.startsWith('/discover');
  const isProjects = pathname?.startsWith('/projects');
  const isTools = pathname?.startsWith('/tools');
  const userAvatar = session?.user?.image ? getAvatarImageAttrs(session.user.image, 32) : null;
  const visibleSortOptions = sortOptions ?? (Object.keys(sortLabels) as SortOption[]);
  const navigationItems = [
    { href: '/discover', label: 'Discover', icon: Database, active: isDiscover, visible: true },
    {
      href: '/projects',
      label: 'Projects',
      icon: FolderKanban,
      active: isProjects,
      visible: status === 'authenticated',
    },
    {
      href: '/tools',
      label: 'Tools',
      icon: Wrench,
      active: isTools,
      visible: status === 'authenticated',
    },
    {
      href: '/stars',
      label: 'Library',
      icon: Star,
      active: !isDiscover && !isProjects && !isTools,
      visible: status === 'authenticated',
    },
  ].filter((item) => item.visible);

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b bg-background/80 px-3 py-2.5 backdrop-blur-sm sm:gap-3 sm:px-4 sm:py-3 md:px-6">
      {onMenuClick && (
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 md:hidden"
          onClick={onMenuClick}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-5" />
        </Button>
      )}

      {typeof searchQuery === 'string' && onSearchChange ? (
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search repos..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
      )}

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
          {navigationItems.map((item) => {
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

      <div className="hidden shrink-0 items-center rounded-md border p-0.5 sm:flex">
        {/* prefetch=false: after login, default Link prefetch floods the Worker
            with concurrent RSC requests and Cloudflare answers 429. */}
        {navigationItems.map((item) => {
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

      {typeof repoCount === 'number' && (
        <span className="hidden shrink-0 text-sm text-muted-foreground lg:inline">
          {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
        </span>
      )}

      {onSync && (
        <Button
          variant="outline"
          size="sm"
          className={`shrink-0 gap-1.5 text-xs transition-all${syncing ? ' border-primary/50 text-primary' : ''}`}
          onClick={onSync}
          disabled={syncing}
        >
          {syncing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync'}</span>
        </Button>
      )}

      {hasActiveFilters && onClearFilters && (
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
      )}

      {sortBy && onSortChange && (
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
      )}

      {viewMode && onViewModeChange && (
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
      )}

      {status === 'authenticated' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 overflow-hidden rounded-full sm:size-9"
            >
              {session?.user?.image ? (
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
              ) : (
                <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
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
      ) : (
        <Button asChild size="sm" className="shrink-0">
          <Link href="/">Connect GitHub</Link>
        </Button>
      )}
    </header>
  );
}
