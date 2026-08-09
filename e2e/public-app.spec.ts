import { expect, type Page, test } from '@playwright/test';

const repo = {
  id: 1,
  name: 'starboard',
  full_name: 'codevetter/starboard',
  owner_login: 'codevetter',
  owner_avatar: 'https://avatars.githubusercontent.com/u/1?v=4',
  owner: { login: 'codevetter', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
  html_url: 'https://github.com/codevetter/starboard',
  description: 'Project-aware open-source discovery and tool intelligence.',
  language: 'TypeScript',
  stargazers_count: 12_500,
  archived: false,
  topics: ['github', 'discovery'],
  repo_created_at: '2026-01-01T00:00:00Z',
  repo_updated_at: '2026-08-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  list_id: null,
  collection_ids: [],
  tags: [],
  notes: null,
  starred_at: null,
  is_starred: false,
  is_saved: false,
  star_growth_30d: 420,
};

async function mockGuestSession(page: Page) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  );
}

test.beforeEach(async ({ page }) => {
  await mockGuestSession(page);
});

test('Discover keeps the first search request alive and shows matching repositories', async ({
  page,
}) => {
  await page.route('**/discover/data**', (route) =>
    route.fulfill({
      json: {
        repos: [repo],
        total: 1,
        facets: {
          languages: [['TypeScript', 1]],
          lists: [],
          tags: [],
          tools: [{ key: 'nextjs', name: 'Next.js', count: 1 }],
        },
        minStars: 5000,
      },
    })
  );

  await page.goto('/discover');
  await page.getByPlaceholder('Search repos...').fill('tool intelligence');

  await expect(page.getByRole('link', { name: /codevetter\/starboard/i })).toBeVisible();
  await expect(page.getByText(/couldn't load discover results/i)).toHaveCount(0);
  await expect(page).toHaveURL(/q=tool\+intelligence|q=tool%20intelligence/);

  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    const repositoryCount = page.getByRole('button', {
      name: /how discover selects repositories/i,
    });
    await repositoryCount.hover();
    await expect(
      page.getByText(/discover starts with public github repositories at 5,000\+ stars/i)
    ).toBeVisible();
  }
});

test('tool intelligence renders one bounded page and loads more on demand', async ({ page }) => {
  await page.route('**/api/tools?**', async (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const count = offset === 0 ? 48 : 1;
    const repos = Array.from({ length: count }, (_, index) => {
      const id = offset + index + 1;
      return {
        ...repo,
        id,
        name: `repo-${id}`,
        full_name: `acme/repo-${id}`,
        html_url: `https://github.com/acme/repo-${id}`,
        tool: {
          toolKey: 'vitest',
          toolName: 'Vitest',
          category: 'testing',
          url: 'https://vitest.dev',
          confidence: 96,
          sources: ['package.json'],
        },
      };
    });
    await route.fulfill({
      json: {
        scope: 'discover',
        disclaimer: 'Detections come from repository manifests and may need verification.',
        tool: {
          toolKey: 'vitest',
          toolName: 'Vitest',
          category: 'testing',
          url: 'https://vitest.dev',
          repoCount: 49,
          avgConfidence: 96,
          maxConfidence: 100,
        },
        repos,
        page: { offset, limit: 48, hasMore: offset === 0 },
      },
    });
  });

  await page.goto('/tools/vitest');
  await expect(page.getByRole('heading', { name: 'Vitest', level: 1 })).toBeVisible();
  await expect(page.getByText('Showing 48 of 49 matching repositories.')).toBeVisible();
  await expect(page.getByRole('link', { name: /^acme\/repo-/ })).toHaveCount(48);

  await page.getByRole('button', { name: 'Load 48 more' }).click();
  await expect(page.getByText('Showing 49 of 49 matching repositories.')).toBeVisible();
  await expect(page.getByRole('link', { name: /^acme\/repo-/ })).toHaveCount(49);
});

test('repository intelligence reuses the app shell and omits discussion controls', async ({
  page,
}, testInfo) => {
  await page.route('**/api/repos/lookup?**', (route) => route.fulfill({ json: { repo } }));
  await page.route('**/api/repos/1/similar?**', (route) =>
    route.fulfill({
      json: {
        similar: [
          {
            ...repo,
            id: 2,
            name: 'peer',
            full_name: 'acme/peer',
            html_url: 'https://github.com/acme/peer',
            similarity: 0.88,
          },
        ],
      },
    })
  );
  await page.route('**/api/repos/1/tools', (route) =>
    route.fulfill({
      json: {
        disclaimer: 'Manifest evidence',
        tools: [
          {
            toolKey: 'vitest',
            toolName: 'Vitest',
            category: 'testing',
            url: 'https://vitest.dev',
            confidence: 96,
            sources: ['package.json'],
          },
        ],
      },
    })
  );
  await page.route('**/api/repos/1/star-history?**', (route) =>
    route.fulfill({
      json: {
        points: [
          { stargazersCount: 12_000, capturedAt: '2026-07-01T00:00:00Z' },
          { stargazersCount: 12_500, capturedAt: '2026-08-01T00:00:00Z' },
        ],
        growth: { starsGained: 500, percentGrowth: 4.2, enoughHistory: true },
      },
    })
  );

  await page.goto('/explore/codevetter/starboard');
  await expect(page.getByRole('heading', { name: 'Repository Intelligence' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'starboard', level: 1 })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 640) {
    await expect(page.getByRole('button', { name: 'Open product navigation' })).toBeVisible();
  } else {
    await expect(page.getByRole('link', { name: 'Discover', exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Similar projects' })).toBeVisible();
  await expect(page.getByText('Discussion', { exact: true })).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);

  if (!process.env.CI && testInfo.project.name === 'desktop') {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        )
      ).toBe(false);
      await page.screenshot({
        path: `.fleet/evidence/core-discovery-hardening/after-${width}.png`,
        fullPage: true,
      });
    }
  }
});

test('uncataloged public preview asks for sign-in without presenting a rate-limit failure', async ({
  page,
}) => {
  await page.route('**/api/project-preview?**', (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: 'Sign in to preview a repository that is not in the Starboard catalog yet.',
        loginRequired: true,
      },
    })
  );

  await page.goto('/project-preview?repository=acme%2Fprivate-to-catalog');
  await expect(page.locator('section[role="alert"]')).toContainText(
    'Sign in to preview a repository that is not in the Starboard catalog yet.'
  );
  await expect(page.getByRole('link', { name: 'Sign in to preview' })).toBeVisible();
  await expect(page.getByText(/rate limit/i)).toHaveCount(0);
});
