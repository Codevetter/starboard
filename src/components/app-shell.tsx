import { SessionTracker } from '@/components/session-tracker';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <SessionTracker />
      {children}
    </div>
  );
}
