import { describe, expect, it } from "vitest";

import {
  buildMaintainerDigest,
  type MaintainerDigestRepoInput,
} from "@/lib/maintainer-digest";

const baseRepo: MaintainerDigestRepoInput = {
  id: 1,
  name: "repo",
  fullName: "owner/repo",
  htmlUrl: "https://github.com/owner/repo",
  description: "A useful project",
  language: "TypeScript",
  stargazersCount: 1200,
  archived: false,
  repoUpdatedAt: "2026-05-01T00:00:00Z",
  starredAt: "2026-05-07T00:00:00Z",
  isStarred: true,
  isSaved: false,
  notes: null,
  collectionCount: 0,
  starsSevenDaysAgo: 1150,
  thresholdEventsSevenDays: 0,
};

describe("maintainer digest", () => {
  const now = new Date("2026-05-08T00:00:00Z");

  it("groups new additions and suggested actions", () => {
    const digest = buildMaintainerDigest([baseRepo], now);

    expect(digest.summary.newlyStarred).toBe(1);
    expect(digest.summary.suggestedActions).toBe(1);
    expect(digest.groups.find((group) => group.id === "newly_starred")?.items[0]?.starboardUrl).toBe("/explore/owner/repo");
    expect(digest.groups.find((group) => group.id === "suggested_actions")?.items[0]?.actionLabel).toBe("Assign collection");
  });

  it("flags high-momentum repositories from stars and thresholds", () => {
    const digest = buildMaintainerDigest(
      [
        {
          ...baseRepo,
          id: 2,
          fullName: "owner/hot",
          htmlUrl: "https://github.com/owner/hot",
          stargazersCount: 7200,
          starsSevenDaysAgo: 6800,
          thresholdEventsSevenDays: 1,
        },
      ],
      now
    );

    const highMomentum = digest.groups.find((group) => group.id === "high_momentum");
    expect(highMomentum?.items).toHaveLength(1);
    expect(highMomentum?.items[0]?.detail).toContain("threshold");
  });

  it("surfaces stale saved repos for review", () => {
    const digest = buildMaintainerDigest(
      [
        {
          ...baseRepo,
          id: 3,
          fullName: "owner/stale",
          htmlUrl: "https://github.com/owner/stale",
          isSaved: true,
          isStarred: false,
          repoUpdatedAt: "2024-01-01T00:00:00Z",
          starredAt: "2025-01-01T00:00:00Z",
        },
      ],
      now
    );

    const atRisk = digest.groups.find((group) => group.id === "at_risk");
    expect(atRisk?.items).toHaveLength(1);
    expect(atRisk?.items[0]?.actionLabel).toBe("Review saved status");
  });

  it("surfaces repos that are losing stars", () => {
    const digest = buildMaintainerDigest(
      [
        {
          ...baseRepo,
          id: 4,
          fullName: "owner/losing",
          htmlUrl: "https://github.com/owner/losing",
          stargazersCount: 1000,
          starsSevenDaysAgo: 1100,
        },
      ],
      now
    );

    const atRisk = digest.groups.find((group) => group.id === "at_risk");
    expect(atRisk?.items).toHaveLength(1);
    expect(atRisk?.items[0]?.actionLabel).toBe("Re-evaluate");
    expect(atRisk?.items[0]?.priority).toBe("urgent");
  });

  it("surfaces recently updated library repos in recent_releases group", () => {
    const digest = buildMaintainerDigest(
      [
        {
          ...baseRepo,
          id: 6,
          fullName: "owner/updated",
          htmlUrl: "https://github.com/owner/updated",
          starredAt: "2026-03-01T00:00:00Z",
          repoUpdatedAt: "2026-04-30T00:00:00Z",
        },
      ],
      now
    );

    const recentReleases = digest.groups.find((group) => group.id === "recent_releases");
    expect(recentReleases?.items).toHaveLength(1);
    expect(recentReleases?.items[0]?.fullName).toBe("owner/updated");
    expect(recentReleases?.items[0]?.detail).toContain("Updated");
    expect(digest.summary.recentReleases).toBe(1);
  });

  it("excludes newly-starred repos from recent_releases to avoid duplication", () => {
    const digest = buildMaintainerDigest(
      [
        {
          ...baseRepo,
          id: 7,
          fullName: "owner/new-and-updated",
          htmlUrl: "https://github.com/owner/new-and-updated",
          starredAt: "2026-05-07T00:00:00Z",
          repoUpdatedAt: "2026-05-07T00:00:00Z",
        },
      ],
      now
    );

    const recentReleases = digest.groups.find((group) => group.id === "recent_releases");
    const newlyStarred = digest.groups.find((group) => group.id === "newly_starred");
    expect(recentReleases?.items).toHaveLength(0);
    expect(newlyStarred?.items).toHaveLength(1);
  });

  it("includes high-momentum repos not recently starred", () => {
    const digest = buildMaintainerDigest(
      [
        {
          ...baseRepo,
          id: 8,
          fullName: "owner/trending",
          htmlUrl: "https://github.com/owner/trending",
          starredAt: "2026-01-01T00:00:00Z",
          stargazersCount: 8000,
          starsSevenDaysAgo: 7800,
          thresholdEventsSevenDays: 0,
        },
      ],
      now
    );

    const highMomentum = digest.groups.find((group) => group.id === "high_momentum");
    expect(highMomentum?.items).toHaveLength(1);
    expect(highMomentum?.items[0]?.fullName).toBe("owner/trending");
  });

  it("surfaces archived repos for review", () => {
    const digest = buildMaintainerDigest(
      [
        {
          ...baseRepo,
          id: 5,
          fullName: "owner/archived",
          htmlUrl: "https://github.com/owner/archived",
          isSaved: true,
          archived: true,
          repoUpdatedAt: "2024-01-01T00:00:00Z",
        },
      ],
      now
    );

    const atRisk = digest.groups.find((group) => group.id === "at_risk");
    expect(atRisk?.items).toHaveLength(1);
    expect(atRisk?.items[0]?.actionLabel).toBe("Archive or remove");
    expect(atRisk?.items[0]?.priority).toBe("urgent");
  });

  it("formats stale saved repos with a readable age", () => {
    const digest = buildMaintainerDigest(
      [
        {
          ...baseRepo,
          id: 9,
          fullName: "owner/stale-readable",
          htmlUrl: "https://github.com/owner/stale-readable",
          isSaved: true,
          isStarred: false,
          repoUpdatedAt: "2024-01-01T00:00:00Z",
        },
      ],
      now
    );

    const atRisk = digest.groups.find((group) => group.id === "at_risk");
    expect(atRisk?.items[0]?.detail).toMatch(/last updated .*ago\./);
    expect(atRisk?.items[0]?.detail).not.toMatch(/\b\d{3,}\b/);
  });
});
