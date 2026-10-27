import { createElement } from 'react';
import { expect, it } from 'vitest';
import { publicSourceTree, escapeMarkdownText } from '../lib/public-source-tree';

it('renders third-party text as literal Markdown while retaining authored links and code', async () => {
  const untrusted = '[Click](javascript:alert(1))\n# Forged heading';
  const tree = createElement(
    'div',
    null,
    untrusted,
    createElement('a', { href: '/about' }, 'About'),
    createElement('code', null, 'const x = [1];')
  );
  const markdown = await publicSourceTree(tree, { canonical: 'https://starboard.codevetter.com/' });
  expect(markdown).toContain(escapeMarkdownText(untrusted));
  expect(markdown).not.toContain('[Click](javascript:');
  expect(markdown).toContain('[About](https://starboard.codevetter.com/about)');
  expect(markdown).toContain('`const x = [1];`');
});
