import { SessionTracker } from '@/components/session-tracker';

export default function StarsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-svh flex-col bg-background">
      <SessionTracker />
      {children}
    </div>
  );
}
