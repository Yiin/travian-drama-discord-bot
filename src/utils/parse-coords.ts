export interface Coordinates {
  x: number;
  y: number;
}

export interface PlayerUrlInfo {
  serverKey: string;
  playerId: number;
}

/**
 * Parse a Travian player profile URL.
 * Example: https://ts31.x3.europe.travian.com/profile/1685
 * Returns server key (ts31.x3.europe) and player ID (1685)
 */
export function parsePlayerUrl(input: string): PlayerUrlInfo | null {
  const normalized = input.trim();

  // Match Travian profile URL pattern
  const match = normalized.match(
    /^https?:\/\/([a-z0-9.]+)\.travian\.com\/profile\/(\d+)/i
  );

  if (!match) {
    return null;
  }

  const serverKey = match[1];
  const playerId = parseInt(match[2], 10);

  if (isNaN(playerId)) {
    return null;
  }

  return { serverKey, playerId };
}

export function parseCoords(input: string): Coordinates | null {
  // Strip Unicode directional formatting characters (LTR/RTL overrides, etc.)
  // and normalize Unicode minus signs to ASCII hyphen-minus
  const normalized = input
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[−–—‒]/g, '-');

  // Check if input is a URL with x and y parameters
  if (normalized.includes('?') && normalized.includes('x=') && normalized.includes('y=')) {
    try {
      const url = new URL(normalized);
      const xParam = url.searchParams.get('x');
      const yParam = url.searchParams.get('y');

      if (xParam !== null && yParam !== null) {
        const x = parseInt(xParam, 10);
        const y = parseInt(yParam, 10);

        if (!isNaN(x) && !isNaN(y)) {
          return { x, y };
        }
      }
    } catch {
      // Not a valid URL, fall through to regex parsing
    }
  }

  // Match all integers (including negative numbers)
  const matches = normalized.match(/-?\d+/g);

  if (!matches || matches.length < 2) {
    return null;
  }

  const x = parseInt(matches[0], 10);
  const y = parseInt(matches[1], 10);

  if (isNaN(x) || isNaN(y)) {
    return null;
  }

  return { x, y };
}
