import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const footerSource = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'landing-astro',
    'src',
    'components',
    'ProductFooter.astro'
  ),
  'utf8'
);

describe('landing product-state kicker', () => {
  it('does not stamp a hardcoded month that silently goes stale', () => {
    // A literal "· <Month> <year>" claims freshness the page cannot keep; the
    // label shipped "August 2026" well into September.
    expect(footerSource).not.toMatch(
      /Current product state[^<]*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/
    );
  });
});
