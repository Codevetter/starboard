import type { Metadata } from 'next';

import { ProjectPreviewWorkspace } from '@/components/project-preview-workspace';
import { PUBLIC_CANONICALS } from '@/lib/public-canonicals';

export const metadata: Metadata = {
  title: 'Preview a GitHub project',
  description: 'Inspect a public GitHub project and find grounded tool recommendations.',
  alternates: { canonical: PUBLIC_CANONICALS.projectPreview },
};

export default async function ProjectPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string | string[] }>;
}) {
  const params = await searchParams;
  const repository = Array.isArray(params.repository) ? params.repository[0] : params.repository;
  return <ProjectPreviewWorkspace initialRepository={repository ?? ''} />;
}
