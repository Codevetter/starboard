import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'src/app/api/discover/route.ts',
  'src/app/api/stars/route.ts',
  'src/app/api/stars/sync/route.ts',
];

describe('D1 bound-parameter regression guards', () => {
  it('passes variable-length filter sets through one json_each parameter', () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf-8');
      expect(source, file).toContain('json_each(?)');
    }
  });
});
