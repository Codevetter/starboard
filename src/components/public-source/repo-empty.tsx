import { Inbox, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RepoGridEmpty({
  hasActiveFilters,
  onClearFilters,
}: {
  hasActiveFilters: boolean;
  onClearFilters: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Inbox className="mb-4 size-12 text-muted-foreground/50" />
      <h3 className="text-lg font-medium text-foreground">No repos match your filters</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try adjusting your search or filter criteria to find what you are looking for.
      </p>
      {hasActiveFilters && onClearFilters && (
        <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={onClearFilters}>
          <RotateCcw className="size-3.5" />
          Reset all filters
        </Button>
      )}
    </div>
  );
}
