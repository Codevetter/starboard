'use client';

import { Bookmark, BookmarkX, ListPlus, Loader2, Rows3, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { UserList } from '@/hooks/use-lists';

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onSaveAll: () => void;
  onUnsaveAll: () => void;
  onCompare: () => void;
  onAssignToList: (listId: number) => void;
  lists: UserList[];
  busy?: boolean;
  allSaved: boolean;
  noneSaved: boolean;
}

export function BulkActionBar({
  selectedCount,
  onClear,
  onSaveAll,
  onUnsaveAll,
  onCompare,
  onAssignToList,
  lists,
  busy,
  allSaved,
  noneSaved,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:bottom-6"
    >
      <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 rounded-2xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur sm:flex-nowrap">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
            {selectedCount}
          </span>
          <span className="text-sm font-medium">selected</span>
          {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onCompare}
            disabled={busy || selectedCount < 2}
            title={selectedCount < 2 ? 'Select 2 or more to compare' : 'Compare side-by-side'}
          >
            <Rows3 className="size-3.5" />
            <span className="hidden sm:inline">Compare</span>
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={busy || lists.length === 0}
                title={lists.length === 0 ? 'Create a collection first' : 'Add to collection'}
              >
                <ListPlus className="size-3.5" />
                <span className="hidden sm:inline">Add to</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1">
              <p className="mb-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Add selection to
              </p>
              {lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => onAssignToList(list.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: list.color }}
                  />
                  <span className="flex-1 truncate">{list.name}</span>
                </button>
              ))}
              {lists.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">No collections yet.</p>
              )}
            </PopoverContent>
          </Popover>

          {!allSaved && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={onSaveAll}
              disabled={busy}
              title="Save selected to library"
            >
              <Bookmark className="size-3.5" />
              <span className="hidden sm:inline">Save</span>
            </Button>
          )}

          {!noneSaved && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={onUnsaveAll}
              disabled={busy}
              title="Remove selected from library"
            >
              <BookmarkX className="size-3.5" />
              <span className="hidden sm:inline">Remove</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onClear}
            aria-label="Clear selection"
            disabled={busy}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
