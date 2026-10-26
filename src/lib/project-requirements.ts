import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

export function requirementDocuments(project: ProjectRecommendationRepo) {
  const context = project.sourceContext;
  if (!context) return [{ path: 'description', text: project.description ?? '' }];
  const documents = context.documents?.length
    ? context.documents.filter(
        (document) =>
          /(?:^|\/)(?:PRODUCT|PROJECT_STATUS|README)(?:\.(?:md|markdown|rst|txt))?$/i.test(
            document.path
          ) || /(?:^|\/)docs\/product\/.*\.md$/i.test(document.path)
      )
    : context.readme
      ? [{ path: 'README.md', text: context.readme }]
      : [];
  const contract = documents.find((document) => /(?:^|\/)PRODUCT\.md$/i.test(document.path));
  return (contract ? [contract] : documents).map((document) => ({
    path: document.path,
    text: 'requirementText' in document ? String(document.requirementText) : document.text,
  }));
}

export function explicitRequirements(text: string): Array<{ statement: string; quote: string }> {
  const requirements: Array<{ statement: string; quote: string }> = [];
  let fence = '';
  let excludedLevel = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const delimiter = line.match(new RegExp(`^(${String.fromCharCode(96)}{3,}|~{3,})`));
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = '';
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (!fence && heading) {
      if (excludedLevel && heading[1].length <= excludedLevel) excludedLevel = 0;
      if (/example|sample|tutorial|non-goal|out.of.scope|deferred|historical/i.test(heading[2]))
        excludedLevel = heading[1].length;
      continue;
    }
    if (excludedLevel || fence || /^>|^[-*]\s+\[[xX]\]/.test(line)) continue;
    const statement = requirementStatement(line);
    if (!statement) continue;
    requirements.push({ statement, quote: line });
  }
  return requirements;
}

function requirementStatement(line: string): string | null {
  const unchecked = line.match(/^[-*]\s+\[ \]\s+(.+)$/);
  const statement = unchecked?.[1] ?? line.replace(/^[-*]\s+/, '');
  if (
    !unchecked &&
    !/^(?:TODO\s*:|missing\b|lacks?\b|cannot\b|not yet\b|needs? to\b)/i.test(statement)
  )
    return null;
  if (
    statement.length < 12 ||
    statement.length > 240 ||
    /^(?:do not|never|keep|preserve|must not|no need|not required|not needed|example|sample|e\.g\.)\b/i.test(
      statement
    )
  )
    return null;
  return statement;
}
