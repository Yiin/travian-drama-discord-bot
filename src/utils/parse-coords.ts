export interface Coordinates {
  x: number;
  y: number;
}

export function parseCoords(input: string): Coordinates | null {
  // Match all integers (including negative numbers)
  const matches = input.match(/-?\d+/g);

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
