import { detection, knownTool, mergeToolDetections, type ToolDetection } from './repo-tools';

interface ManifestDetectorContext {
  path: string;
  content: string;
  detections: ToolDetection[];
  addKnown: (name: string, confidence: number, source?: string) => void;
  addDirect: (key: string, confidence: number, source?: string) => void;
}

function createContext(path: string, content: string): ManifestDetectorContext {
  const detections: ToolDetection[] = [];
  const addKnown = (name: string, confidence: number, source = path) => {
    const tool = knownTool(name);
    if (tool) detections.push(detection(tool, confidence, source));
  };
  const addDirect = (key: string, confidence: number, source = path) => {
    const tool = knownTool(key);
    if (tool) detections.push(detection(tool, confidence, source));
  };
  return { path, content, detections, addKnown, addDirect };
}

function detectPackageJson(ctx: ManifestDetectorContext) {
  try {
    const pkg = JSON.parse(ctx.content) as Record<string, Record<string, string> | string>;
    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const deps = pkg[section];
      if (deps && typeof deps === 'object') {
        for (const name of Object.keys(deps)) ctx.addKnown(name, 92);
      }
    }
    const packageManager = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
    if (packageManager.startsWith('pnpm')) ctx.addDirect('pnpm', 95);
    if (packageManager.startsWith('yarn')) ctx.addDirect('yarn', 95);
    if (packageManager.startsWith('npm')) ctx.addDirect('npm', 95);
  } catch {
    // Invalid package.json is ignored; other files may still provide signals.
  }
}

function detectPyprojectToml(ctx: ManifestDetectorContext) {
  if (/\[tool\.poetry\]/i.test(ctx.content)) ctx.addDirect('poetry', 92);
  if (/\[tool\.uv\]/i.test(ctx.content) || /uv_build/i.test(ctx.content)) ctx.addDirect('uv', 88);
  for (const match of ctx.content.matchAll(/["']([A-Za-z0-9_.-]+)(?:[<=>~! ].*)?["']/g)) {
    ctx.addKnown(match[1]!, 86);
  }
}

function detectRequirementsTxt(ctx: ManifestDetectorContext) {
  for (const line of ctx.content.split('\n')) {
    const name = line.trim().match(/^([A-Za-z0-9_.-]+)/)?.[1];
    if (name) ctx.addKnown(name, 88);
  }
}

function detectLockWithName(ctx: ManifestDetectorContext, toolKey: string) {
  ctx.addDirect(toolKey, 98);
  for (const match of ctx.content.matchAll(/name\s*=\s*["']([^"']+)["']/g))
    ctx.addKnown(match[1]!, 92);
}

function detectCargoFile(ctx: ManifestDetectorContext) {
  ctx.addDirect('cargo', 98);
  for (const match of ctx.content.matchAll(/(?:^|\n)\s*([A-Za-z0-9_-]+)\s*=/g)) {
    ctx.addKnown(match[1]!, 88);
  }
}

function detectGoMod(ctx: ManifestDetectorContext) {
  ctx.addDirect('go', 95);
  for (const match of ctx.content.matchAll(/(?:require\s+|\n\s*)([A-Za-z0-9_.~/-]+)/g)) {
    ctx.addKnown(match[1]!, 88);
  }
}

function detectPomXml(ctx: ManifestDetectorContext) {
  ctx.addDirect('maven', 96);
  for (const match of ctx.content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) {
    ctx.addKnown(match[1]!, 88);
  }
}

function detectGradleFile(ctx: ManifestDetectorContext) {
  ctx.addDirect('gradle', 96);
  for (const match of ctx.content.matchAll(/["']([A-Za-z0-9_.:-]+)["']/g))
    ctx.addKnown(match[1]!, 84);
}

function detectCsprojFile(ctx: ManifestDetectorContext) {
  for (const match of ctx.content.matchAll(/PackageReference Include=["']([^"']+)["']/g)) {
    ctx.addKnown(match[1]!, 90);
  }
}

function detectGemfile(ctx: ManifestDetectorContext) {
  for (const match of ctx.content.matchAll(/gem\s+["']([^"']+)["']/g)) ctx.addKnown(match[1]!, 90);
}

function detectComposerJson(ctx: ManifestDetectorContext) {
  try {
    const composer = JSON.parse(ctx.content) as Record<string, Record<string, string>>;
    for (const section of ['require', 'require-dev']) {
      for (const name of Object.keys(composer[section] ?? {})) ctx.addKnown(name, 90);
    }
  } catch {}
}

function detectPackageSwift(ctx: ManifestDetectorContext) {
  ctx.addDirect('swift', 90);
  for (const match of ctx.content.matchAll(/package:\s*"([^"]+)"/g)) ctx.addKnown(match[1]!, 84);
}

function detectCmakeLists(ctx: ManifestDetectorContext) {
  ctx.addDirect('cmake', 90);
  for (const match of ctx.content.matchAll(/find_package\s*\(\s*([A-Za-z0-9_+-]+)/gi)) {
    ctx.addKnown(match[1]!, 78);
  }
}

function detectConanfile(ctx: ManifestDetectorContext) {
  ctx.addDirect('conan', 95);
  for (const match of ctx.content.matchAll(
    /(?:requires|self\.requires)\s*(?:=|\()\s*["']([^/"']+)/g
  )) {
    ctx.addKnown(match[1]!, 84);
  }
}

function detectVcpkgJson(ctx: ManifestDetectorContext) {
  ctx.addDirect('vcpkg', 96);
  try {
    const vcpkg = JSON.parse(ctx.content) as { dependencies?: Array<string | { name?: string }> };
    for (const dep of vcpkg.dependencies ?? []) {
      ctx.addKnown(typeof dep === 'string' ? dep : (dep.name ?? ''), 88);
    }
  } catch {}
}

function detectMesonBuild(ctx: ManifestDetectorContext) {
  ctx.addDirect('meson', 90);
  for (const match of ctx.content.matchAll(/dependency\s*\(\s*["']([^"']+)["']/g)) {
    ctx.addKnown(match[1]!, 78);
  }
}

function detectDockerfile(ctx: ManifestDetectorContext) {
  ctx.addDirect('docker', 90);
  for (const match of ctx.content.matchAll(/FROM\s+([A-Za-z0-9_./-]+)/gi))
    ctx.addKnown(match[1]!, 72);
}

function detectGithubWorkflow(ctx: ManifestDetectorContext) {
  ctx.addDirect('github-actions', 88);
  for (const match of ctx.content.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
    ctx.addKnown(match[1]!, 70);
  }
}

type ManifestDetector = (ctx: ManifestDetectorContext) => void;

interface DetectorEntry {
  test: (lowerPath: string) => boolean;
  detect: ManifestDetector;
}

const detectors: DetectorEntry[] = [
  { test: (p) => p.endsWith('package.json'), detect: detectPackageJson },
  { test: (p) => p.endsWith('package-lock.json'), detect: (ctx) => ctx.addDirect('npm', 98) },
  { test: (p) => p.endsWith('pnpm-lock.yaml'), detect: (ctx) => ctx.addDirect('pnpm', 98) },
  { test: (p) => p.endsWith('yarn.lock'), detect: (ctx) => ctx.addDirect('yarn', 98) },
  { test: (p) => p.endsWith('pyproject.toml'), detect: detectPyprojectToml },
  { test: (p) => p.endsWith('requirements.txt'), detect: detectRequirementsTxt },
  { test: (p) => p.endsWith('uv.lock'), detect: (ctx) => detectLockWithName(ctx, 'uv') },
  { test: (p) => p.endsWith('poetry.lock'), detect: (ctx) => detectLockWithName(ctx, 'poetry') },
  { test: (p) => p.endsWith('cargo.toml') || p.endsWith('cargo.lock'), detect: detectCargoFile },
  { test: (p) => p.endsWith('go.mod'), detect: detectGoMod },
  { test: (p) => p.endsWith('pom.xml'), detect: detectPomXml },
  {
    test: (p) => p.endsWith('build.gradle') || p.endsWith('build.gradle.kts'),
    detect: detectGradleFile,
  },
  { test: (p) => /\.(csproj|fsproj)$/.test(p) || p.endsWith('.sln'), detect: detectCsprojFile },
  { test: (p) => p.endsWith('gemfile'), detect: detectGemfile },
  { test: (p) => p.endsWith('composer.json'), detect: detectComposerJson },
  { test: (p) => p.endsWith('package.swift'), detect: detectPackageSwift },
  { test: (p) => p.endsWith('cmakelists.txt'), detect: detectCmakeLists },
  { test: (p) => p.includes('conanfile'), detect: detectConanfile },
  { test: (p) => p.endsWith('vcpkg.json'), detect: detectVcpkgJson },
  { test: (p) => p.endsWith('meson.build'), detect: detectMesonBuild },
  {
    test: (p) => p.endsWith('workspace') || p.endsWith('module.bazel'),
    detect: (ctx) => ctx.addDirect('bazel', 92),
  },
  {
    test: (p) => p.endsWith('dockerfile') || p.endsWith('docker-compose.yml'),
    detect: detectDockerfile,
  },
  {
    test: (p) => p.includes('.github/workflows/') && /\.ya?ml$/.test(p),
    detect: detectGithubWorkflow,
  },
  {
    test: (p) => p.endsWith('wrangler.jsonc') || p.endsWith('wrangler.toml'),
    detect: (ctx) => ctx.addDirect('cloudflare-workers', 95),
  },
  { test: (p) => p.endsWith('.tf'), detect: (ctx) => ctx.addDirect('terraform', 90) },
];

export function runManifestDetectors(path: string, content: string): ToolDetection[] {
  const lowerPath = path.toLowerCase();
  const ctx = createContext(path, content);
  for (const { test, detect } of detectors) {
    if (test(lowerPath)) {
      detect(ctx);
      break;
    }
  }
  return mergeToolDetections(ctx.detections);
}
