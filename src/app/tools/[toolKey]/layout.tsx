import type { Metadata } from 'next';
import { getToolDefinition } from '@/lib/repo-tools';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ toolKey: string }>;
}): Promise<Metadata> {
  const { toolKey } = await params;
  const tool = getToolDefinition(toolKey);
  return {
    title: tool?.name ?? toolKey,
    description: `Public repository evidence for ${tool?.name ?? toolKey}`,
    alternates: { canonical: `/tools/${encodeURIComponent(tool?.key ?? toolKey)}` },
  };
}
export default function ToolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
