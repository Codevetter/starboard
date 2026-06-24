'use client';

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { UserList } from '@/hooks/use-lists';

interface ActiveFilterChipsProps {
  searchQuery: string;
  onClearSearch: () => void;
  selectedLanguages: string[];
  onRemoveLanguage: (language: string) => void;
  selectedListId: number | null;
  lists: UserList[];
  onClearList: () => void;
  onClearAll: () => void;
}

export function ActiveFilterChips({
  searchQuery,
  onClearSearch,
  selectedLanguages,
  onRemoveLanguage,
  selectedListId,
  lists,
  onClearList,
  onClearAll,
}: ActiveFilterChipsProps) {
  const trimmedQuery = searchQuery.trim();
  const selectedList = selectedListId != null ? lists.find((l) => l.id === selectedListId) : null;
  const totalChips = (trimmedQuery ? 1 : 0) + selectedLanguages.length + (selectedList ? 1 : 0);

  if (totalChips === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Filtering by
      </span>

      {trimmedQuery && (
        <Chip onRemove={onClearSearch} label={`"${trimmedQuery}"`} prefix="Search" />
      )}

      {selectedLanguages.map((lang) => (
        <Chip key={lang} onRemove={() => onRemoveLanguage(lang)} label={lang} prefix="Lang" />
      ))}

      {selectedList && (
        <Chip
          onRemove={onClearList}
          label={selectedList.name}
          prefix="Collection"
          dotColor={selectedList.color}
        />
      )}

      {totalChips > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onClearAll}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

function Chip({
  prefix,
  label,
  onRemove,
  dotColor,
}: {
  prefix?: string;
  label: string;
  onRemove: () => void;
  dotColor?: string;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border bg-secondary/60 pl-2 pr-1 text-xs text-foreground">
      {dotColor && (
        <span
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {prefix && <span className="text-muted-foreground">{prefix}:</span>}
      <span className="max-w-[14rem] truncate font-medium">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
        aria-label={`Remove ${prefix ?? ''} ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
