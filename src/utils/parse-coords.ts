export interface Coordinates {
  x: number;
  y: number;
}

export function parseCoords(input: string): Coordinates | null {
  // Check if input is a URL with x and y parameters
  if (input.includes('?') && input.includes('x=') && input.includes('y=')) {
    try {
      const url = new URL(input);
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
