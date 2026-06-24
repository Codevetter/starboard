import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { fleetProjects } from '@/lib/fleet-project-data';

export async function GET() {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    projects: fleetProjects.map((project) => ({
      slug: project.slug,
      name: project.name,
      description: project.description,
      tier: project.tier,
      category: project.category,
      priority: project.priority,
      maturity: project.maturity,
      featureAreas: project.featureAreas,
      stack: {
        languages: project.stack.languages,
        frameworks: project.stack.frameworks,
        dependenciesCount: project.stack.dependencies.length + project.stack.devDependencies.length,
      },
    })),
  });
}
