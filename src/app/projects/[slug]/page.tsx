import { ProjectsWorkspace } from "@/components/projects-workspace";

export default async function ProjectRecommendationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProjectsWorkspace selectedSlug={slug} />;
}
