import { describe, expect, it } from "vitest";

import { buildStackBuilderReport, type StackRepoInput } from "@/lib/stack-builder";

const baseRepo: StackRepoInput = {
  id: 1,
  name: "repo",
  fullName: "owner/repo",
  htmlUrl: "https://github.com/owner/repo",
  description: "A useful library",
  language: "TypeScript",
  stargazersCount: 1000,
  archived: false,
  topics: [],
  repoUpdatedAt: "2026-04-20T00:00:00Z",
  starredAt: "2026-01-01T00:00:00Z",
};

describe("stack builder", () => {
  const now = new Date("2026-05-08T00:00:00Z");

  it("selects lane candidates from starred repo signals", () => {
    const report = buildStackBuilderReport(
      [
        {
          ...baseRepo,
          id: 1,
          name: "next.js",
          fullName: "vercel/next.js",
          description: "The React framework for production",
          topics: ["react", "framework", "frontend"],
        },
        {
          ...baseRepo,
          id: 2,
          name: "hono",
          fullName: "honojs/hono",
          description: "Web framework for building APIs on workers",
          topics: ["api", "server", "cloudflare"],
        },
        {
          ...baseRepo,
          id: 3,
          name: "drizzle-orm",
          fullName: "drizzle-team/drizzle-orm",
          description: "TypeScript ORM for SQL databases",
          topics: ["orm", "sql", "database"],
        },
      ],
      now
    );

    expect(report.summary.totalRepos).toBe(3);
    expect(report.summary.coveredLanes).toBeGreaterThanOrEqual(3);
    expect(report.lanes.find((lane) => lane.id === "frontend")?.selected?.fullName).toBe("vercel/next.js");
    expect(report.lanes.find((lane) => lane.id === "backend")?.selected?.fullName).toBe("honojs/hono");
    expect(report.lanes.find((lane) => lane.id === "database")?.selected?.fullName).toBe("drizzle-team/drizzle-orm");
  });

  it("penalizes archived repositories when picking a lane", () => {
    const report = buildStackBuilderReport(
      [
        {
          ...baseRepo,
          id: 1,
          name: "old-ui",
          fullName: "owner/old-ui",
          archived: true,
          stargazersCount: 50_000,
          topics: ["frontend", "react"],
        },
        {
          ...baseRepo,
          id: 2,
          name: "active-ui",
          fullName: "owner/active-ui",
          stargazersCount: 5_000,
          topics: ["frontend", "react"],
        },
      ],
      now
    );

    expect(report.lanes.find((lane) => lane.id === "frontend")?.selected?.fullName).toBe("owner/active-ui");
  });

  it("summarizes top languages", () => {
    const report = buildStackBuilderReport(
      [
        baseRepo,
        { ...baseRepo, id: 2, fullName: "owner/js", language: "JavaScript" },
        { ...baseRepo, id: 3, fullName: "owner/ts-two", language: "TypeScript" },
      ],
      now
    );

    expect(report.summary.topLanguages[0]).toEqual(["TypeScript", 2]);
  });
});
