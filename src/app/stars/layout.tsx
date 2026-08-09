import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { auth } from '@/lib/auth';

export default async function StarsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.githubId) {
    redirect('/login?callbackUrl=%2Fstars');
  }
  return <AppShell>{children}</AppShell>;
}
