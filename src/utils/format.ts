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

export const BAR_WIDTH = 16;

/** Whole-number percent of `sent` over `needed`, capped at 100. `needed` of 0 gives 0. */
export function percentOf(sent: number, needed: number): number {
  if (needed <= 0) return 0;
  return Math.min(100, Math.round((sent / needed) * 100));
}

/** Text progress bar: `▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱` for 24%. Width is fixed so bars line up. */
export function progressBar(sent: number, needed: number, width = BAR_WIDTH): string {
  const filled = Math.round((percentOf(sent, needed) / 100) * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

/** Longest note kept on a stack request; the panel has a 4000-char text budget. */
export const MAX_NOTE_LENGTH = 100;

/** Trim a free-text note to MAX_NOTE_LENGTH characters. */
export function clipNote(note: string | undefined): string {
  const trimmed = (note ?? "").trim();
  return trimmed.length > MAX_NOTE_LENGTH ? trimmed.slice(0, MAX_NOTE_LENGTH - 1) + "…" : trimmed;
}
