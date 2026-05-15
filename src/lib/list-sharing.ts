const DEFAULT_SUFFIX = () => Math.random().toString(16).slice(2, 6);

export function slugifyListName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 90) || "list"
  );
}

export async function generateUniqueListSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>,
  suffix: () => string = DEFAULT_SUFFIX
): Promise<string> {
  const base = slugifyListName(name);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${suffix()}`.slice(0, 100);
    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`.slice(0, 100);
}
