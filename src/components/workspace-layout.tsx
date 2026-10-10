'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { TopBar } from '@/components/top-bar';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

interface WorkspaceLayoutProps {
  title: string;
  description: string;
  sidebar: ReactNode;
  sidebarLabel: string;
  children: ReactNode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
}

/** Shared header, sidebar and scrolling geometry for project and tool workspaces. */
export function WorkspaceLayout({
  sidebar,
  sidebarLabel,
  children,
  ...header
}: WorkspaceLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <>
      <TopBar {...header} onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-r p-4 md:block">
          {sidebar}
        </aside>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[280px] gap-0 overflow-y-auto p-0">
            <SheetTitle className="sr-only">{sidebarLabel}</SheetTitle>
            <SheetDescription className="sr-only">
              Choose the context for {header.title.toLowerCase()}.
            </SheetDescription>
            <div className="p-4 pt-12">{sidebar}</div>
          </SheetContent>
        </Sheet>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </>
  );
}
