import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const config = readFileSync(resolve('wrangler.jsonc'), 'utf8');
const placeholder = '00000000-0000-0000-0000-000000000000';

if (config.includes(placeholder)) {
  console.error('D1 database_id is still the fail-closed preparation placeholder.');
  process.exit(1);
}

if (!config.includes('"binding": "DB"') || !config.includes('"database_name": "starboard"')) {
  console.error('wrangler.jsonc must declare the project-owned starboard D1 binding as DB.');
  process.exit(1);
}

console.info('D1 production binding is configured.');
