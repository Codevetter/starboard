import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  execute: vi.fn(),
  retrieveProjectIntelligence: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/db', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/lib/project-intelligence', () => ({
  retrieveProjectIntelligence: mocks.retrieveProjectIntelligence,
}));

import { GET } from '@/app/api/projects/[slug]/recommendations/route';

const connectedRow = {
  id: 42,
  name: 'app',
  full_name: 'acme/app',
  owner_login: 'acme',
  owner_avatar: 'https://example.com/avatar.png',
  html_url: 'https://github.com/acme/app',
  description: 'A TypeScript application',
  language: 'TypeScript',
  stargazers_count: 100,
  archived: 0,
  topics: '["nextjs"]',
  connected_at: '2026-08-08T00:00:00Z',
  ai_summary: null,
  ai_category: null,
  ai_keywords: '[]',
  tools: '[]',
};

const emptyIntelligence = {
  similarProjects: [],
  recommendedTools: [],
  fallback: true,
  context: { language: null, topics: [], tools: [] },
  retrieval: {
    mode: 'fallback' as const,
    candidateCount: 0,
    semanticCandidates: 0,
    lexicalCandidates: 0,
    structuredCandidates: 0,
  },
};

describe('GET /api/projects/[slug]/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { githubId: 'user-1' } });
    mocks.execute.mockResolvedValue({ rows: [connectedRow] });
    mocks.retrieveProjectIntelligence.mockResolvedValue(emptyIntelligence);
  });

  it('refuses guests and sessions without githubId', async () => {
    mocks.auth.mockResolvedValueOnce(null);

    const guest = await GET(new NextRequest('http://localhost/api/projects/42/recommendations'), {
      params: Promise.resolve({ slug: '42' }),
    });

    expect(guest.status).toBe(401);
    expect(await guest.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.retrieveProjectIntelligence).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValueOnce({ user: {} });

    const unsigned = await GET(
      new NextRequest('http://localhost/api/projects/42/recommendations'),
      { params: Promise.resolve({ slug: '42' }) }
    );

    expect(unsigned.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.retrieveProjectIntelligence).not.toHaveBeenCalled();
  });

  it('returns empty peer and tool lists when retrieval has no matches', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/projects/42/recommendations'),
      { params: Promise.resolve({ slug: '42' }) }
    );
    const payload = (await response.json()) as {
      similarProjects: unknown[];
      recommendedTools: unknown[];
      fallback: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.similarProjects).toEqual([]);
    expect(payload.recommendedTools).toEqual([]);
    expect(payload.fallback).toBe(true);
    expect(mocks.retrieveProjectIntelligence).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, fullName: 'acme/app' }),
      24
    );
  });

  it('clamps the requested peer limit at the route boundary', async () => {
    const oversized = await GET(
      new NextRequest('http://localhost/api/projects/42/recommendations?limit=200'),
      { params: Promise.resolve({ slug: '42' }) }
    );

    expect(oversized.status).toBe(200);
    expect(mocks.retrieveProjectIntelligence).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      50
    );

    mocks.retrieveProjectIntelligence.mockClear();

    const undersized = await GET(
      new NextRequest('http://localhost/api/projects/42/recommendations?limit=0'),
      { params: Promise.resolve({ slug: '42' }) }
    );

    expect(undersized.status).toBe(200);
    expect(mocks.retrieveProjectIntelligence).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      24
    );
  });
});
