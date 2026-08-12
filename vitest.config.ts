import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    // Playwright e2e specs live in ./e2e and run via `pnpm test:e2e`, not Vitest.
    exclude: ['node_modules', 'dist', '.next', 'e2e/**', '.agents/**', '.codex/**'],
    coverage: {
      provider: 'v8',
      reporter: ['json', 'text-summary'],
      // Keep the complete production library and database denominator visible.
      // UI and route behavior remains covered by the Playwright suite.
      include: ['src/lib/**/*.{ts,tsx}', 'src/db/**/*.{ts,tsx}'],
      thresholds: {
        lines: 61,
        functions: 64,
        statements: 60,
        branches: 53,
      },
      exclude: [
        'node_modules',
        'dist',
        '.next',
        'coverage',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test/**',
        'src/app/**',
        'src/components/**',
        'src/hooks/**',
        'src/types/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
