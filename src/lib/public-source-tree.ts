import type { ReactNode } from 'react';

/** Keep third-party visible text literal; Markdown syntax comes from the renderer. */
export function escapeMarkdownText(value: unknown): string {
  return String(value ?? '').replace(/[\\`*_{}[\]()<>#+.!|~-]/g, '\\$&');
}

/** Project the authored React content tree directly; never serialize or scrape HTML. */
export interface SourceTreeOptions {
  canonical: string;
  adapters?: Map<unknown, (props: Record<string, unknown>) => string | Promise<string>>;
}

type Element = { type: unknown; props: Record<string, unknown> };
const block = new Set([
  'article',
  'section',
  'main',
  'header',
  'footer',
  'div',
  'figure',
  'figcaption',
  'address',
  'dl',
  'dt',
  'dd',
  'details',
  'summary',
]);
const ignored = new Set([
  'script',
  'style',
  'svg',
  'canvas',
  'iframe',
  'noscript',
  'input',
  'textarea',
]);

export async function publicSourceTree(
  node: ReactNode | unknown,
  options: SourceTreeOptions
): Promise<string> {
  const protectedContent: string[] = [];
  const preserve = (text: string) => {
    const key = `\u001eSOURCE_${protectedContent.length}\u001e`;
    protectedContent.push(text);
    return key;
  };
  const href = (value: unknown) => {
    if (typeof value !== 'string') throw new Error('Source link requires a string href');
    const url = new URL(value, options.canonical);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return '';
    return url.href.replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29');
  };
  async function visit(input: unknown, depth = 0, rawText = false): Promise<string> {
    if (depth > 100) throw new Error('Public source component nesting limit');
    const value = await input;
    if (value == null || typeof value === 'boolean') return '';
    if (typeof value === 'string' || typeof value === 'number')
      return rawText ? String(value) : escapeMarkdownText(value);
    if (Array.isArray(value))
      return (await Promise.all(value.map((child) => visit(child, depth + 1, rawText)))).join('');
    if (typeof value !== 'object' || !('type' in value) || !('props' in value))
      throw new Error('Unsupported public source node');
    const { type, props } = value as Element;
    const adapter = options.adapters?.get(type);
    if (adapter) return preserve(await adapter(props));
    if (typeof type === 'function') return visit(await type(props), depth + 1, rawText);
    if (type === Symbol.for('react.fragment') || type === Symbol.for('react.suspense'))
      return visit(props.children, depth + 1, rawText);
    if (
      typeof type === 'object' &&
      type &&
      '$$typeof' in type &&
      type.$$typeof === Symbol.for('react.memo') &&
      'type' in type
    )
      return visit({ type: (type as { type: unknown }).type, props }, depth + 1);
    if (
      typeof type === 'object' &&
      type &&
      '$$typeof' in type &&
      type.$$typeof === Symbol.for('react.forward_ref') &&
      'render' in type
    )
      return visit((type as { render: (props: unknown) => unknown }).render(props), depth + 1);
    if (typeof type !== 'string')
      throw new Error('Public component requires an explicit source adapter');
    if (
      ignored.has(type) ||
      props.hidden ||
      props['aria-hidden'] === true ||
      props['aria-hidden'] === 'true'
    )
      return '';
    if (type === 'nav' && props['aria-label'] === 'Breadcrumb') return '';
    if (props.dangerouslySetInnerHTML)
      throw new Error('Public source must use authored Markdown, not serialized HTML');
    if (type === 'select') {
      const options = Array.isArray(props.children) ? props.children : [props.children];
      const active = props.value ?? props.defaultValue;
      const selected = options.find(
        (option) =>
          option &&
          typeof option === 'object' &&
          'props' in option &&
          (option as Element).props.value === active
      );
      return selected ? visit(selected, depth + 1) : '';
    }
    const body = await visit(
      props.children,
      depth + 1,
      rawText || type === 'code' || type === 'pre'
    );
    if (/^h[1-6]$/.test(type)) return `\n\n${'#'.repeat(Number(type[1]))} ${body.trim()}\n\n`;
    if (type === 'p' || block.has(type)) return `\n\n${body.trim()}\n\n`;
    if (type === 'br') return '\n';
    if (type === 'hr') return '\n\n---\n\n';
    if (type === 'strong' || type === 'b') return `**${body}**`;
    if (type === 'em' || type === 'i') return `*${body}*`;
    if (type === 'code') return `\`${body}\``;
    if (type === 'pre') return preserve(`\n\n\`\`\`\n${body.replace(/^`|`$/g, '')}\n\`\`\`\n\n`);
    if (type === 'blockquote')
      return (
        '\n\n' +
        body
          .trim()
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') +
        '\n\n'
      );
    if (type === 'a') {
      const target = href(props.href);
      return target ? `[${body.trim() || target}](${target})` : body;
    }
    if (type === 'img')
      return props.alt && props.src
        ? `![${escapeMarkdownText(props.alt)}](${href(props.src)})`
        : '';
    if (type === 'li') return `\n- ${body.trim().replaceAll('\n', '\n  ')}\n`;
    if (type === 'ul' || type === 'ol') return `\n\n${body.trim()}\n\n`;
    if (type === 'td' || type === 'th')
      return ` ${body
        .trim()
        .replace(/(?<!\\)\|/g, '\\|')
        .replaceAll('\n', ' ')} |`;
    if (type === 'tr') return `|${body}\n`;
    if (type === 'thead') {
      const lines = body.trim().split('\n');
      const columns = (lines[0]?.match(/(?<!\\)\|/g)?.length ?? 1) - 1;
      return `${body}|${' --- |'.repeat(columns)}\n`;
    }
    if (type === 'table') return `\n\n${body.trim()}\n\n`;
    if (
      type === 'span' ||
      type === 'small' ||
      type === 'time' ||
      type === 'label' ||
      type === 'button'
    )
      return `${body} `;
    return body;
  }
  let rendered = `${(await visit(node))
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
  for (let i = protectedContent.length - 1; i >= 0; i--)
    rendered = rendered.replaceAll(`\u001eSOURCE_${i}\u001e`, protectedContent[i]!);
  return rendered;
}
