import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    // Playwright e2e specs live in ./e2e and run via `pnpm test:e2e`, not Vitest.
    exclude: ["node_modules", "dist", ".next", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["json", "text-summary"],
      // Selective thresholds on core logic modules with dedicated unit tests,
      // following the swe-interview-prep fleet model. UI/config/DB-integration
      // files are excluded — they are covered by e2e or integration suites.
      include: [
        "src/lib/fleet-projects.ts",
        "src/lib/recommendation-eval.ts",
        "src/lib/search.ts",
        "src/lib/stack-builder.ts",
        "src/lib/starboard-rag-documents.ts",
        "src/lib/release-radar.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
      exclude: [
        "node_modules",
        "dist",
        ".next",
        "coverage",
        "**/*.d.ts",
        "**/*.config.*",
        "**/test/**",
        "src/db/**",
        "src/app/**",
        "src/components/**",
        "src/hooks/**",
        "src/types/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
