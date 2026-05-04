/**
 * Parse a user-provided time input and return a Unix timestamp (seconds).
 *
 * Supported formats:
 * - "HH:MM" / "HH:MM:SS"  — interpreted as UTC time-of-day; rolled forward 24h
 *                            if already past. Defaults to :59 seconds when omitted
 *                            so the moment is treated as "next occurrence".
 * - "in HH:MM:SS hrs.at HH:MM:SS"  — Travian's literal Movements paste; uses the
 *                                     travel duration (first triplet) and adds it
 *                                     to now.
 *
 * Returns null if the input doesn't match any supported format.
 */
export function parseTimeToTimestamp(input: string): number | null {
  const trimmed = input.trim();

  // Travian Movements paste: "in  34:43:31  hrs.at  05:05:31"
  const travianMatch = trimmed.match(
    /^in\s+(\d+):(\d{2}):(\d{2})\s+hrs\.?\s*at\s+(\d{1,2}):(\d{2}):(\d{2})$/i
  );
  if (travianMatch) {
    const travelHours = parseInt(travianMatch[1], 10);
    const travelMinutes = parseInt(travianMatch[2], 10);
    const travelSeconds = parseInt(travianMatch[3], 10);

    if (travelMinutes > 59 || travelSeconds > 59) {
      return null;
    }

    const now = Date.now();
    const travelMs =
      ((travelHours * 60 + travelMinutes) * 60 + travelSeconds) * 1000;
    return Math.floor((now + travelMs) / 1000);
  }

  // Simple time-of-day: HH:MM or HH:MM:SS (UTC)
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) {
    return null;
  }

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 59;

  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }

  const now = new Date();
  const target = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hours,
      minutes,
      seconds
    )
  );

  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return Math.floor(target.getTime() / 1000);
}

/**
 * Format a parseable time input as a Discord relative timestamp,
 * or fall back to the raw trimmed input wrapped in parens.
 */
export function formatTimeDisplay(input: string): string {
  const timestamp = parseTimeToTimestamp(input);
  if (timestamp !== null) {
    return `<t:${timestamp}:R>`;
  }
  return `(${input.trim()})`;
}
