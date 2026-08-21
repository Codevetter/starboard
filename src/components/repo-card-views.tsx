'use client';

import { Archive, Clock3, Star } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ListPicker } from '@/components/list-picker';
import type { UserList } from '@/hooks/use-lists';
import type { UserRepo } from '@/hooks/use-starred-repos';
import { cn } from '@/lib/utils';

interface RepoCardSharedProps {
  repo: UserRepo;
  lists?: UserList[];
  onAssignList?: (repoId: number, listId: number, assigned: boolean) => void;
  onToggleSave?: (repoId: number, saved: boolean) => void;
  isSelected: boolean;
  onToggleSelect?: (repoId: number, selected: boolean) => void;
  langColor: string | null;
  avatar: React.ReactNode;
  saveButton: React.ReactNode;
  selectCheckbox: React.ReactNode | null;
  updatedDate: string | null;
  collectionIds: number[];
}

export function RepoCardListview(props: RepoCardSharedProps) {
  const {
    repo,
    lists,
    onAssignList,
    onToggleSave,
    onToggleSelect,
    saveButton,
    selectCheckbox,
    langColor,
    avatar,
    updatedDate,
    collectionIds,
  } = props;
  return (
    <div
      className={cn(
        'group overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/50',
        props.isSelected && 'border-primary/60 bg-primary/5 ring-1 ring-primary/20',
        'grid grid-cols-[auto_auto_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-4 sm:p-3.5',
        !onToggleSelect && 'grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto]'
      )}
    >
      {selectCheckbox && <div className="flex items-start pt-0.5">{selectCheckbox}</div>}
      <div className="shrink-0">{avatar}</div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/explore/${repo.full_name}`}
            className="truncate font-medium text-foreground hover:underline"
          >
            <span className="text-muted-foreground">{repo.owner.login}/</span>
            {repo.name}
          </Link>
          {repo.archived && (
            <Badge
              variant="outline"
              className="hidden shrink-0 gap-1 text-[10px] font-normal uppercase tracking-normal text-muted-foreground sm:inline-flex"
            >
              <Archive className="size-3" />
              Archived
            </Badge>
          )}
        </div>
        {repo.description && (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{repo.description}</p>
        )}
        <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1.5">
          {repo.archived && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] font-normal uppercase tracking-normal text-muted-foreground sm:hidden"
            >
              <Archive className="size-3" />
              Archived
            </Badge>
          )}
          {repo.topics.length > 0 &&
            repo.topics.slice(0, 4).map((topic) => (
              <Badge key={topic} variant="secondary" className="text-[10px] font-normal">
                {topic}
              </Badge>
            ))}
        </div>
      </div>
      <div className="col-start-2 flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground sm:col-start-auto sm:min-w-64 sm:justify-end sm:gap-3">
        {repo.language && (
          <span className="hidden items-center gap-1.5 md:flex">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: langColor ?? undefined }}
            />
            {repo.language}
          </span>
        )}
        {updatedDate && (
          <span className="hidden items-center gap-1 lg:flex">
            <Clock3 className="size-3" />
            {updatedDate}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Star className="size-3 fill-current" />
          {formatStarCount(repo.stargazers_count)}
        </span>
        {saveButton}
        {lists && onAssignList && (
          <ListPicker
            repoId={repo.id}
            currentListIds={collectionIds}
            lists={lists}
            onAssign={onAssignList}
          />
        )}
      </div>
    </div>
  );
}

export function RepoCardGridview(props: RepoCardSharedProps) {
  const {
    repo,
    lists,
    onAssignList,
    saveButton,
    selectCheckbox,
    langColor,
    avatar,
    updatedDate,
    collectionIds,
  } = props;
  return (
    <div
      className={cn(
        'group overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/50',
        props.isSelected && 'border-primary/60 bg-primary/5 ring-1 ring-primary/20',
        'flex min-w-0 flex-col p-3.5 sm:p-4'
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {selectCheckbox}
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <Link
            href={`/explore/${repo.full_name}`}
            className="block min-w-0 truncate font-medium leading-tight text-foreground hover:underline"
            title={repo.full_name}
          >
            <span className="text-muted-foreground">{repo.owner.login}/</span>
            {repo.name}
          </Link>
          {repo.archived && (
            <Badge
              variant="outline"
              className="mt-1 inline-flex gap-1 text-[10px] font-normal uppercase tracking-normal text-muted-foreground"
            >
              <Archive className="size-3" />
              Archived
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {saveButton}
          {lists && onAssignList && (
            <ListPicker
              repoId={repo.id}
              currentListIds={collectionIds}
              lists={lists}
              onAssign={onAssignList}
            />
          )}
        </div>
      </div>

      {repo.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {repo.description}
        </p>
      )}

      <div className="mt-auto pt-3">
        {repo.topics.length > 0 && (
          <div className="mb-3 flex h-5 min-w-0 gap-1.5 overflow-hidden">
            {repo.topics.slice(0, 4).map((topic) => (
              <Badge
                key={topic}
                variant="secondary"
                className="max-w-32 shrink-0 text-[10px] font-normal"
                title={topic}
              >
                <span className="block min-w-0 truncate">{topic}</span>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
          {repo.language && (
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              <span
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: langColor ?? undefined }}
              />
              <span className="truncate">{repo.language}</span>
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1">
            <Star className="size-3 fill-current" />
            {formatStarCount(repo.stargazers_count)}
          </span>
          {updatedDate && (
            <span className="flex shrink-0 items-center gap-1">
              <Clock3 className="size-3" />
              {updatedDate}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function formatStarCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  }
  return count.toString();
}

export function formatUpdatedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}
