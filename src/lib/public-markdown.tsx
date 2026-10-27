import { createElement, type ReactNode } from 'react';
import Link from 'next/link';
import * as icons from 'lucide-react';
import { NextRequest } from 'next/server';
import { publicSourceTree } from './public-source-tree';
import { SITE_IDENTITY } from './site-identity';
import About from '@/app/about/page';
import Privacy from '@/app/privacy/page';
import Terms from '@/app/terms/page';
import CatalogUpdates from '@/app/catalog-updates/page';
import PublicList, { generateMetadata as listMetadata } from '@/app/lists/[slug]/page';
import { AppShell } from '@/components/app-shell';
import { TopBar } from '@/components/top-bar';
import { WorkspaceLayout } from '@/components/workspace-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ToolIntelligenceGuide as ClientGuide,
  ToolFiltersSidebar,
} from '@/components/tool-intelligence-guide';
import { ToolIntelligenceGuide } from '@/components/public-source/tool-guide';
import { ToolsView } from '@/components/public-source/tools-view';
import {
  ToolDetailHeader,
  ToolRepoGrid,
  ToolStatusMessages,
} from '@/components/public-source/tool-detail';
import {
  RepoHeaderCard,
  RepoSecondaryData,
  SimilarReposSection,
} from '@/components/public-source/repository';
import { PreviewForm, PreviewStatusSections } from '@/components/public-source/project-preview';
import { RepoGridEmpty } from '@/components/public-source/repo-empty';
import { RepoCard } from '@/components/public-source/repo-card';
import { getToolDefinition } from './repo-tools';
import { getPublicRepo, repositorySlug } from './public-repo';
import { GET as discover } from '@/app/api/discover/route';
import { GET as tools } from '@/app/api/tools/route';
import { GET as repoTools } from '@/app/api/repos/[repoId]/tools/route';
import { GET as history } from '@/app/api/repos/[repoId]/star-history/route';
import { GET as similar } from '@/app/api/repos/[repoId]/similar/route';

const noop = () => {};
export const STATIC_PUBLIC_ROUTES = [
  {
    path: '/about',
    title: 'How to organize and semantically search GitHub stars',
    description: 'Native GitHub tools, semantic search, and the Starboard workflow.',
  },
  {
    path: '/privacy',
    title: 'Privacy policy',
    description: 'Starboard data handling and privacy.',
  },
  { path: '/terms', title: 'Terms of use', description: 'Terms for using Starboard.' },
  {
    path: '/discover',
    title: 'Discover open-source projects',
    description: 'Search and compare public GitHub projects and the tools they use.',
  },
  {
    path: '/tools',
    title: 'Developer tool intelligence',
    description: 'Compare developer tools using evidence from public GitHub repositories.',
  },
  {
    path: '/catalog-updates',
    title: 'Catalog updates',
    description: 'Recently added repositories in the shared Discover corpus.',
  },
  {
    path: '/project-preview',
    title: 'Preview a GitHub project',
    description: 'Inspect a public GitHub project and find grounded tool recommendations.',
  },
];
const request = (path: string) => new NextRequest(new URL(path, SITE_IDENTITY.origin));
async function json(response: Response) {
  if (!response.ok) throw new Error(`Public source unavailable: ${response.status}`);
  return response.json();
}
export async function publicMarkdown(path: string) {
  const entry = STATIC_PUBLIC_ROUTES.find((r) => r.path === path);
  let title = entry?.title,
    description = entry?.description ?? '',
    tree: ReactNode;
  if (path === '/about') tree = <About />;
  else if (path === '/privacy') tree = <Privacy />;
  else if (path === '/terms') tree = <Terms />;
  else if (path === '/catalog-updates') tree = await CatalogUpdates();
  else if (path === '/project-preview')
    tree = (
      <main>
        <PreviewForm repository="" onRepositoryChange={noop} onSubmit={noop} />
        <PreviewStatusSections
          statusData={{
            initialRepository: '',
            isLoading: false,
            data: undefined,
            error: undefined,
          }}
          previewLoginHref="/login"
        />
      </main>
    );
  else if (path === '/discover') {
    const data = await json(await discover(request('/discover/data?sort=stars')));
    tree = (
      <main>
        <h1>Discover</h1>
        {data.repos.length === 0 ? (
          <RepoGridEmpty hasActiveFilters={false} onClearFilters={noop} />
        ) : (
          data.repos.map((repo: Parameters<typeof RepoCard>[0]['repo']) => (
            <RepoCard key={repo.id} repo={repo} />
          ))
        )}
      </main>
    );
  } else if (path === '/tools') {
    const data = await json(
      await tools(request('/api/tools?scope=discover&min_confidence=0&min_stars=10000&limit=300'))
    );
    tree = (
      <ToolsView
        data={data}
        tools={data.tools}
        error={undefined}
        isInitialLoading={false}
        isValidating={false}
        scope="discover"
        minConfidence={0}
        query=""
        isAuthenticated={false}
        setScope={noop}
        setMinConfidence={noop}
        setQuery={noop}
      />
    );
  } else if (/^\/tools\/[^/]+$/.test(path)) {
    const key = decodeURIComponent(path.slice(7));
    const result = await tools(
      request(
        `/api/tools?scope=discover&min_confidence=0&min_stars=10000&limit=48&tool=${encodeURIComponent(key)}`
      )
    );
    if (result.status === 404) return null;
    const data = await json(result);
    if (!data.tool || (data.tool.repoCount === 0 && !getToolDefinition(key))) return null;
    path = `/tools/${encodeURIComponent(data.tool.toolKey)}`;
    title = data.tool.toolName;
    description = `Repository evidence for ${title}`;
    tree = (
      <main>
        <ToolDetailHeader tool={data.tool} decodedToolKey={key} />
        <ToolIntelligenceGuide disclaimer={data.disclaimer} />
        <ToolStatusMessages
          loading={{ isInitialLoading: false, isValidating: false, isLoadingMore: false }}
          data={{ error: undefined, pages: [data], tool: data.tool, repos: data.repos }}
        />
        <ToolRepoGrid repos={data.repos} isInitialLoading={false} />
      </main>
    );
  } else if (path.startsWith('/explore/')) {
    const slug = repositorySlug(path.slice(9).split('/'));
    if (!slug) return null;
    const repo = await getPublicRepo(slug);
    if (!repo) return null;
    const params = { params: Promise.resolve({ repoId: String(repo.id) }) };
    const [toolData, historyData, similarData] = await Promise.all([
      json(await repoTools(request(`/api/repos/${repo.id}/tools`), params)),
      json(await history(request(`/api/repos/${repo.id}/star-history?days=180`), params)),
      json(await similar(request(`/api/repos/${repo.id}/similar?scope=global&limit=8`), params)),
    ]);
    path = `/explore/${repo.full_name}`;
    title = repo.full_name;
    description = repo.description ?? 'Public repository intelligence';
    tree = (
      <main>
        <RepoHeaderCard repo={repo} isAuthenticated={false} />
        <RepoSecondaryData starHistory={historyData} repoTools={toolData} />
        <SimilarReposSection
          similar={similarData.repos ?? similarData.similar ?? []}
          similarLoading={false}
        />
      </main>
    );
  } else if (/^\/lists\/[a-zA-Z0-9_-]+$/.test(path)) {
    // The existing source loader enforces is_public=1 before any list contents are read.
    tree = await PublicList({ params: Promise.resolve({ slug: path.slice(7) }) });
    const metadata = await listMetadata({ params: Promise.resolve({ slug: path.slice(7) }) });
    title = typeof metadata.title === 'string' ? metadata.title : 'Shared repository list';
    description = 'A publicly shared Starboard repository collection.';
  } else return null;
  const canonical = SITE_IDENTITY.origin + path;
  const render = (node: unknown): Promise<string> =>
    publicSourceTree(node, { canonical, adapters });
  const children = (p: Record<string, unknown>) => render(p.children);
  const adapters = new Map<unknown, (props: Record<string, unknown>) => string | Promise<string>>([
    [
      Link,
      async (p) => `[${(await children(p)).trim()}](${new URL(String(p.href), canonical).href})`,
    ],
    [AppShell, children],
    [WorkspaceLayout, children],
    [Button, children],
    [Badge, children],
    [Input, () => ''],
    [Skeleton, () => ''],
    [TopBar, (p) => `## ${p.title ?? ''}\n\n${p.description ?? ''}\n`],
    [ClientGuide, (p) => render(createElement(ToolIntelligenceGuide, p))],
    [ToolFiltersSidebar, () => ''],
  ]);
  for (const icon of Object.values(icons)) adapters.set(icon, () => '');
  const body = await render(tree);
  return {
    path,
    title,
    description,
    markdown: `# ${title}\n\n> ${description}\n\nCanonical: ${canonical}\n\n${body}`,
  };
}
