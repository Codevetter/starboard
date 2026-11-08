// Publication is a subset of the existing guest Discover catalog. Personal
// starred membership is deliberately not an admission rule.
const PUBLIC_REPOSITORY_MIN_STARS = 5000;
const PUBLIC_REPOSITORY_DESCRIPTION_LENGTH = 30;

export function publicRepositoryPath(fullName: string): string | null {
  const parts = fullName.split('/');
  if (
    parts.length !== 2 ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(parts[0]) ||
    !/^[a-z\d_.-]{1,100}$/i.test(parts[1]) ||
    parts[1] === '.' ||
    parts[1] === '..'
  )
    return null;
  return `/explore/${parts.map(encodeURIComponent).join('/')}`;
}

export function isPublishableRepository(row: Record<string, unknown>): boolean {
  if (row.private === true || (row.visibility && row.visibility !== 'public')) return false;
  if (typeof row.full_name !== 'string' || !publicRepositoryPath(row.full_name)) return false;
  const [owner, name] = row.full_name.split('/');
  return (
    Number.isSafeInteger(row.id) &&
    Number(row.id) > 0 &&
    row.name === name &&
    row.owner_login === owner &&
    row.html_url === `https://github.com/${row.full_name}` &&
    typeof row.stargazers_count === 'number' &&
    row.stargazers_count >= PUBLIC_REPOSITORY_MIN_STARS &&
    typeof row.description === 'string' &&
    row.description.trim().length >= PUBLIC_REPOSITORY_DESCRIPTION_LENGTH
  );
}
