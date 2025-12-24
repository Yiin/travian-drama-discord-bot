/**
 * Parse comma-separated names into an array
 */
export function parseNames(input: string): string[] {
  return input
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * Normalize a server key by removing protocol, domain suffix, and trailing slashes
 */
export function normalizeServerKey(input: string): string {
  let key = input.trim().toLowerCase();

  // Remove protocol if present
  key = key.replace(/^https?:\/\//, "");

  // Remove .travian.com suffix if present
  key = key.replace(/\.travian\.com\/?$/, "");

  // Remove trailing slash
  key = key.replace(/\/+$/, "");

  return key;
}

/**
 * Validate a server key format
 * Should be like: ts31.x3.europe or ts5.x1.international
 */
export function isValidServerKey(key: string): boolean {
  return /^[a-z0-9]+(\.[a-z0-9]+)+$/.test(key);
}
