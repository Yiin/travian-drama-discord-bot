/**
 * Parse a human-entered troop/resource count.
 * Strips commas/dots/whitespace (so "1,000" / "1.000" / "1 000" all work),
 * then parses as a base-10 integer. Returns null for blank or invalid input.
 */
export function parseTroopCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = parseInt(trimmed.replace(/[,.\s]/g, ""), 10);
  if (isNaN(parsed) || parsed < 1) return null;
  return parsed;
}
