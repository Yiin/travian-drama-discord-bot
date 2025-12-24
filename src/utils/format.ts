/**
 * Format a number with thousand separators (US locale)
 */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}
