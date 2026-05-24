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
});
