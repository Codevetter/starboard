import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('project-first activation wiring', () => {
  it('lets the static landing submit a public repository directly to preview', () => {
    const landing = source('landing-astro/src/pages/index.astro');

    expect(landing).toContain('action="/project-preview"');
    expect(landing).toContain('name="repository"');
    expect(landing).toContain('No account needed for catalog matches');
    expect(landing).toContain('Uncataloged repositories use your signed-in GitHub session');
    expect(landing).toContain('Browse Discover instead');
    expect(landing).not.toContain('Library · this week');
    expect(landing).not.toContain('>Hot<');
    expect(landing).not.toContain('>Watch<');
    expect(landing).not.toContain('>Stale<');
  });

  it('loads GitHub choices only from the explicit picker and preserves manual entry', () => {
    const workspace = source('src/components/projects-workspace.tsx');
    const projectsLayout = source('src/app/projects/layout.tsx');
    const starsLayout = source('src/app/stars/layout.tsx');
    const appShell = source('src/components/app-shell.tsx');
    const topBar = source('src/components/top-bar.tsx');

    expect(workspace).toContain("fetch('/api/github/projects')");
    expect(workspace).toContain("setSource('picker')");
    expect(workspace).toContain("setSource('manual')");
    expect(workspace).toContain('initialRepository={initialRepository}');
    expect(workspace).toContain('Paste a URL instead');
    expect(workspace).toContain('<TopBar title="Projects"');
    expect(workspace).not.toContain('function ProjectNav()');
    expect(projectsLayout).toContain('<AppShell>');
    expect(starsLayout).toContain('<AppShell>');
    expect(appShell).toContain('<SessionTracker />');
    expect(appShell).toContain('flex h-svh flex-col');
    expect(topBar).toContain('aria-label="Open product navigation"');
    expect(topBar).toContain('className="size-11 shrink-0 sm:hidden"');
  });

  it('reuses the shared shell and navigation across discovery surfaces', () => {
    const discover = source('src/app/discover/discover-client.tsx');
    const discoverLayout = source('src/app/discover/layout.tsx');
    const tools = source('src/app/tools/page.tsx');
    const toolDetail = source('src/app/tools/[toolKey]/page.tsx');
    const toolsLayout = source('src/app/tools/layout.tsx');
    const topBar = source('src/components/top-bar.tsx');

    expect(discoverLayout).toContain('<AppShell>');
    expect(toolsLayout).toContain('<AppShell>');
    expect(tools).toContain('<TopBar');
    expect(toolDetail).toContain('<TopBar');
    expect(tools).toContain('<ToolIntelligenceGuide');
    expect(tools).toContain('<ToolScopeSelector');
    expect(toolDetail).toContain('<ToolIntelligenceGuide');
    expect(toolDetail).toContain('<ToolScopeSelector');
    expect(tools).not.toContain('<header className=');
    expect(toolDetail).not.toContain('<header className=');
    expect(discover).toContain('repoCountDescription=');
    expect(topBar).toContain('role="tooltip"');
    expect(topBar).toContain('aria-describedby="repository-count-explanation"');
    expect(topBar).toContain("label: 'Tools'");
    expect(topBar).toContain('visible: true');
  });

  it('carries a successful preview through sign-in without auto-connecting it', () => {
    const preview = source('src/components/project-preview-workspace.tsx');
    const login = source('src/app/login/page.tsx');
    const authNavigation = source('src/lib/auth-navigation.ts');
    const projectsPage = source('src/app/projects/page.tsx');

    expect(preview).toContain('/login?callbackUrl=');
    expect(preview).toContain('/projects?repository=');
    expect(preview).toContain('Nothing is saved until');
    expect(preview).toContain('you explicitly connect the project');
    expect(login).toContain('resolveInternalCallbackUrl');
    expect(authNavigation).toContain("value.startsWith('//')");
    expect(authNavigation).toContain("value.includes('\\\\')");
    expect(authNavigation).toContain("DEFAULT_AUTH_DESTINATION = '/discover'");
    expect(projectsPage).toContain('initialRepository={repository ??');
  });
});
