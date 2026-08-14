import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shared loading skeleton for the stars and discover list surfaces.
 * Both pages render an identical header + sidebar + card grid placeholder
 * while session or data is resolving.
 */
export function PageSkeleton() {
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
