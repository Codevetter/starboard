import { describe, expect, it } from 'vitest';

import {
  detectToolsFromManifest,
  detectToolsFromRepoSignals,
  detectToolsFromSbomPackageNames,
  getToolUrl,
  isPotentialToolManifest,
} from '@/lib/repo-tools';

function keys(result: Array<{ toolKey: string }>) {
  return result.map((tool) => tool.toolKey);
}

describe('repo tool detection', () => {
  it('detects high-confidence tools from package.json', () => {
    const result = detectToolsFromManifest(
      'package.json',
      JSON.stringify({
        packageManager: 'pnpm@10.0.0',
        dependencies: { next: 'latest', react: 'latest', '@libsql/client': 'latest' },
        devDependencies: { vitest: 'latest', '@playwright/test': 'latest' },
      })
    );

    expect(keys(result)).toEqual(
      expect.arrayContaining(['next', 'react', 'sqlite', 'vitest', 'playwright', 'pnpm'])
    );
    expect(result.find((tool) => tool.toolKey === 'next')?.confidence).toBeGreaterThanOrEqual(90);
  });

  it('detects C and C++ build-system evidence without pretending it is package-perfect', () => {
    const result = detectToolsFromManifest(
      'CMakeLists.txt',
      'cmake_minimum_required(VERSION 3.25)\nfind_package(OpenSSL REQUIRED)'
    );

    expect(keys(result)).toContain('cmake');
    expect(result.find((tool) => tool.toolKey === 'cmake')?.confidence).toBe(90);
  });

  it('detects package-manager evidence from vcpkg manifests', () => {
    const result = detectToolsFromManifest(
      'vcpkg.json',
      JSON.stringify({ dependencies: ['openssl', { name: 'sqlite3' }] })
    );

    expect(keys(result)).toEqual(expect.arrayContaining(['vcpkg', 'sqlite']));
  });

  it('detects SBOM-backed packages at high confidence', () => {
    const result = detectToolsFromSbomPackageNames(['next', '@cloudflare/workers-types']);

    expect(keys(result)).toEqual(expect.arrayContaining(['next', 'cloudflare-workers']));
    expect(result[0]?.confidence).toBe(98);
  });

  it('keeps metadata-only signals lower confidence', () => {
    const result = detectToolsFromRepoSignals({
      language: 'TypeScript',
      topics: ['react', 'cloudflare-workers'],
      description: 'A LangChain app',
    });

    expect(keys(result)).toEqual(
      expect.arrayContaining(['typescript', 'react', 'cloudflare-workers', 'langchain'])
    );
    expect(result.find((tool) => tool.toolKey === 'langchain')?.confidence).toBeLessThan(60);
  });

  it('recognizes relevant manifests and skips bulky generated paths', () => {
    expect(isPotentialToolManifest('packages/app/package.json')).toBe(true);
    expect(isPotentialToolManifest('src/native/CMakeLists.txt')).toBe(true);
    expect(isPotentialToolManifest('node_modules/pkg/package.json')).toBe(false);
  });

  it('provides stable reference links for tool detail pages', () => {
    expect(getToolUrl('react')).toBe('https://react.dev');
    expect(getToolUrl('unknown-tool')).toBe('https://github.com/topics/unknown-tool');
  });
});
