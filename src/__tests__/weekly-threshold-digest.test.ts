import { describe, expect, it } from 'vitest';

import { capDigestForGithubIssue } from '../../scripts/weekly-threshold-digest';

describe('weekly threshold digest', () => {
  it('leaves digest bodies below the issue limit unchanged', () => {
    expect(capDigestForGithubIssue('short digest', 100)).toBe('short digest');
  });

  it('caps long digest bodies and preserves a truncation note', () => {
    const body = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n');
    const capped = capDigestForGithubIssue(body, 240);

    expect(capped.length).toBeLessThanOrEqual(240);
    expect(capped).toContain('## Truncated');
    expect(capped).toContain('were omitted');
  });
});
