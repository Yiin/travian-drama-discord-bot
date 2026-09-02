/**
 * The only place for user-facing number formatting.
 */

export const ARROW = "→";

/** Troop counts: `1,200`, `12,345`. Always whole numbers with grouping. */
export function formatTroops(num: number): string {
  return Math.round(num).toLocaleString("en-US");
}

/** Resource amounts: `950`, `500k`, `1.2M`, `2M`. One decimal only when it carries information. */
export function formatResources(num: number): string {
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return scaled(num, 1_000_000, "M");
  if (abs >= 1_000) return scaled(num, 1_000, "k");
  return Math.round(num).toString();
}

function scaled(num: number, unit: number, suffix: string): string {
  const value = num / unit;
  const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded}${suffix}`;
}

/** Population and other plain counts: `12,345`. */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}
