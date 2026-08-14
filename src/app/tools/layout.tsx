import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { PUBLIC_CANONICALS } from '@/lib/public-canonicals';

export const metadata: Metadata = {
  title: 'Developer tool intelligence',
  description: 'Compare developer tools using evidence from public GitHub repositories.',
  alternates: { canonical: PUBLIC_CANONICALS.tools },
};

export default function ToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
