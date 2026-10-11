import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated' }) }));
vi.mock('@/components/top-bar', () => ({ TopBar: () => null }));

import RepositoryDetail from '@/app/explore/[...slug]/repository-detail';

describe('repository initial HTML', () => {
  it('contains the real name, description, topics and facts before client fetching', () => {
    const html = renderToStaticMarkup(
      createElement(RepositoryDetail, {
        repoSlug: 'fleet/example',
        initialRepo: {
          id: 1,
          name: 'example',
          full_name: 'fleet/example',
          owner_login: 'fleet',
          owner_avatar: 'https://example.com/avatar.png',
          html_url: 'https://github.com/fleet/example',
          description: 'Useful public repository evidence.',
          language: 'TypeScript',
          stargazers_count: 42,
          topics: ['regression-testing'],
          repo_created_at: null,
          repo_updated_at: null,
        },
      })
    );
    expect(html).toMatch(/<h1[^>]*>example<\/h1>/);
    expect(html).toContain('Useful public repository evidence.');
    expect(html).toContain('regression-testing');
    expect(html).toContain('TypeScript');
    expect(html).toContain('github.com/fleet/example');
    expect(html).not.toContain('Failed to load repository');
  });
});
