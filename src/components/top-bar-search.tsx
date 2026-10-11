'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchTitleProps {
  title?: string;
  description?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
}

export function SearchOrTitle(props: SearchTitleProps) {
  const {
    title,
    description,
    searchQuery,
    onSearchChange,
    searchPlaceholder = 'Search repos...',
  } = props;
  if (typeof searchQuery === 'string' && onSearchChange) {
    return (
      <div className="relative order-last w-full min-w-0 flex-none sm:order-none sm:w-auto sm:min-w-48 sm:flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    );
  }
  return (
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-sm font-semibold">{title}</h1>
      {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
