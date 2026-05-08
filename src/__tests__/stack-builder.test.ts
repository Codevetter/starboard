import { describe, expect, it } from "vitest";

import { buildStackBuilderReport, parseStackGoal, type StackRepoInput } from "@/lib/stack-builder";

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

  it("classifies starred repos into product stack roles", () => {
    const report = buildStackBuilderReport(
      [
        {
          ...baseRepo,
          id: 1,
          name: "next.js",
          fullName: "vercel/next.js",
          description: "The React framework for production web apps",
          topics: ["react", "framework", "frontend"],
        },
        {
          ...baseRepo,
          id: 2,
          name: "drizzle-orm",
          fullName: "drizzle-team/drizzle-orm",
          description: "TypeScript ORM for SQL databases",
          topics: ["orm", "sql", "database"],
        },
        {
          ...baseRepo,
          id: 3,
          name: "playwright",
          fullName: "microsoft/playwright",
          description: "Reliable end-to-end testing for modern web apps",
          topics: ["testing", "e2e"],
        },
      ],
      { goal: "web-app", now }
    );

    expect(report.summary.totalRepos).toBe(3);
    expect(report.summary.coveredRoles).toBeGreaterThanOrEqual(3);
    expect(report.roles.find((role) => role.id === "framework")?.selected?.fullName).toBe("vercel/next.js");
    expect(report.roles.find((role) => role.id === "database")?.selected?.fullName).toBe("drizzle-team/drizzle-orm");
    expect(report.roles.find((role) => role.id === "testing")?.selected?.fullName).toBe("microsoft/playwright");
  });

  it("flags stale and archived recommendations", () => {
    const report = buildStackBuilderReport(
      [
        {
          ...baseRepo,
          id: 1,
          name: "old-auth",
          fullName: "owner/old-auth",
          archived: true,
          stargazersCount: 20_000,
          topics: ["auth", "oauth"],
          repoUpdatedAt: "2023-01-01T00:00:00Z",
        },
      ],
      { goal: "web-app", now }
    );

    const authPick = report.roles.find((role) => role.id === "auth")?.selected;
    expect(authPick?.warnings).toContain("Archived repository");
    expect(authPick?.warnings).toContain("No release activity in 12 months");
    expect(report.summary.warningCount).toBeGreaterThan(0);
  });

  it("detects close alternatives as role conflicts", () => {
    const report = buildStackBuilderReport(
      [
        {
          ...baseRepo,
          id: 1,
          name: "alpha-framework",
          fullName: "owner/alpha-framework",
          topics: ["framework", "react"],
        },
        {
          ...baseRepo,
          id: 2,
          name: "beta-framework",
          fullName: "owner/beta-framework",
          topics: ["framework", "react"],
        },
      ],
      { goal: "web-app", now }
    );

    expect(report.roles.find((role) => role.id === "framework")?.conflicts[0]).toContain("Choose one primary");
  });

  it("exports selected roles as markdown", () => {
    const report = buildStackBuilderReport(
      [
        {
          ...baseRepo,
          id: 1,
          name: "hono",
          fullName: "honojs/hono",
          description: "Web framework for building APIs on workers",
          topics: ["api", "server", "framework"],
        },
      ],
      { goal: "api-service", now }
    );

    expect(report.goalLabel).toBe("API service");
    expect(report.selectedRepoIds).toEqual([1]);
    expect(report.markdown).toContain("# API service stack");
    expect(report.markdown).toContain("[honojs/hono](https://github.com/owner/repo)");
  });

  it("parses unknown goals as web app", () => {
    expect(parseStackGoal("nope")).toBe("web-app");
    expect(parseStackGoal("ai-app")).toBe("ai-app");
  });
});
