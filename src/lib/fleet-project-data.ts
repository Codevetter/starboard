import type { FleetProjectSnapshot } from '@/lib/fleet-projects';

import fleetProjectsData from '../../data/fleet-projects.generated.json';

export const fleetProjects = fleetProjectsData.projects as FleetProjectSnapshot[];

export function getFleetProject(slug: string): FleetProjectSnapshot | null {
  return fleetProjects.find((project) => project.slug === slug) ?? null;
}
