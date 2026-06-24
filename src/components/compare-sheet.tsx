'use client';

import { Archive, ExternalLink, Star } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { UserRepo } from '@/hooks/use-starred-repos';
import { getAvatarImageAttrs } from '@/lib/avatar';

interface CompareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: UserRepo[];
  onDeselect: (repoId: number) => void;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CompareSheet({ open, onOpenChange, repos, onDeselect }: CompareSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden p-0 sm:max-w-full md:w-[min(900px,90vw)] md:max-w-[900px]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Compare {repos.length} repos</SheetTitle>
          <SheetDescription>
            Side-by-side stats to help you decide what to keep, archive, or save.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {repos.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm text-muted-foreground">
                Nothing selected. Pick repos with the checkboxes to compare them.
              </p>
            </div>
          ) : (
            <div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3">
              {repos.map((repo) => {
                const avatar = getAvatarImageAttrs(repo.owner.avatar_url, 28);
                return (
                  <div
                    key={repo.id}
                    className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="flex items-start gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar.src}
                        srcSet={avatar.srcSet}
                        sizes={avatar.sizes}
                        alt={repo.owner.login}
                        width={28}
                        height={28}
                        className="size-7 shrink-0 rounded-full"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/explore/${repo.full_name}`}
                          className="block truncate text-sm font-semibold hover:underline"
                          title={repo.full_name}
                        >
                          <span className="text-muted-foreground">{repo.owner.login}/</span>
                          {repo.name}
                        </Link>
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3" />
                          GitHub
                        </a>
                      </div>
                    </div>

                    {repo.description && (
                      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {repo.description}
                      </p>
                    )}

                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
                      <Row label="Stars">
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Star className="size-3 fill-current text-foreground" />
                          {formatNumber(repo.stargazers_count)}
                        </span>
                      </Row>
                      <Row label="Language">{repo.language ?? '—'}</Row>
                      <Row label="Updated">{formatDate(repo.updated_at)}</Row>
                      <Row label="Starred">{formatDate(repo.starred_at)}</Row>
                      <Row label="Status">
                        {repo.archived ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Archive className="size-3" />
                            Archived
                          </span>
                        ) : (
                          <span className="text-emerald-500">Active</span>
                        )}
                      </Row>
                      <Row label="Saved">{repo.is_saved ? 'Yes' : 'No'}</Row>
                    </dl>

                    {repo.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {repo.topics.slice(0, 6).map((topic) => (
                          <Badge
                            key={topic}
                            variant="secondary"
                            className="text-[10px] font-normal"
                          >
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2">
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Link href={`/explore/${repo.full_name}`}>Open</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => onDeselect(repo.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-right text-foreground">{children}</dd>
    </>
  );
}
