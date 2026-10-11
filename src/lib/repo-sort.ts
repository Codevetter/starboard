/** Reverse only trusted ordering expressions; IDs keep pagination deterministic. */
export function repoOrderBy(orderBy: string, reversed: boolean): string {
  const ordering = reversed
    ? orderBy.replace(/\b(ASC|DESC)\b/g, (direction) => (direction === 'ASC' ? 'DESC' : 'ASC'))
    : orderBy;
  return `${ordering}, r.id ${reversed ? 'DESC' : 'ASC'}`;
}
