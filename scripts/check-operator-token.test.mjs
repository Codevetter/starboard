import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./check-operator-token.mjs', import.meta.url));

describe('operator workflow preflight', () => {
  it.each([undefined, '', '   '])('fails closed for an absent or blank operator token', (token) => {
    const env = token === undefined ? {} : { STARBOARD_OPERATOR_TOKEN: token };
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('STARBOARD_OPERATOR_TOKEN is required');
  });

  it('accepts a configured token without printing it', () => {
    const token = 'synthetic-operator-only';
    const result = spawnSync(process.execPath, [script], {
      env: { STARBOARD_OPERATOR_TOKEN: token },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toBe('');
  });

  it.each(['seed-popular', 'embed-pending', 'cloudflare-operator-smoke'])(
    '%s checks the dedicated credential before remote work and sends it to the Worker',
    (name) => {
      const workflow = readFileSync(
        new URL(`../.github/workflows/${name}.yml`, import.meta.url),
        'utf8'
      );
      expect(workflow).toContain(
        `STARBOARD_OPERATOR_TOKEN: \${{ secrets.STARBOARD_OPERATOR_TOKEN }}`
      );
      expect(workflow).toContain(`Authorization: Bearer \${STARBOARD_OPERATOR_TOKEN}`);
      expect(workflow).not.toContain('AI_GATEWAY_API_KEY');
      const check = workflow.indexOf('node scripts/check-operator-token.mjs');
      expect(check).toBeGreaterThan(0);
      const remote = workflow.search(/pnpm (db:migrate:remote|exec wrangler d1 info)/);
      expect(remote).toBeGreaterThan(check);
    }
  );
});
