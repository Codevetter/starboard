import type { FleetFeatureArea, FleetProjectSnapshot } from '@/lib/fleet-projects';

import fleetProjectsData from '../../data/fleet-projects.generated.json';

export const fleetProjects = fleetProjectsData.projects as FleetProjectSnapshot[];

export interface FleetProjectSummary {
  slug: string;
  name: string;
  description: string;
  tier: string;
  category: string;
  priority: string;
  maturity: 'public' | 'public-ready' | 'internal-first';
  featureAreas: FleetFeatureArea[];
  stack: {
    languages: string[];
    frameworks: string[];
    dependenciesCount: number;
  };
}

export function getFleetProject(slug: string): FleetProjectSnapshot | null {
  return fleetProjects.find((project) => project.slug === slug) ?? null;
}

/** Public project list for My Projects UI (no DB / no auth needed for the catalog itself). */
export function listFleetProjectSummaries(): FleetProjectSummary[] {
  return fleetProjects.map((project) => ({
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
  }));
}
