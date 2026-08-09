import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const directory of ['.next', '.open-next', '.wrangler/e2e-state']) {
  const target = resolve(projectRoot, directory);
  rmSync(target, { force: true, recursive: true });
}

console.log('[clean-build-output] removed generated build output and E2E state');
