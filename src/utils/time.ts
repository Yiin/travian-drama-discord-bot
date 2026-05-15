/**
 * Validate an IANA timezone string.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function getTimezoneOffsetMs(tz: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value])
  );
  const h = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    h,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - instant.getTime();
}

function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  h: number,
  m: number,
  s: number,
  tz: string
): number {
  const naive = Date.UTC(year, month - 1, day, h, m, s);
  const offset1 = getTimezoneOffsetMs(tz, new Date(naive));
  const guess = naive - offset1;
  const offset2 = getTimezoneOffsetMs(tz, new Date(guess));
  return naive - offset2;
}

function getZonedDateParts(tz: string, instant: Date): {
  year: number;
  month: number;
  day: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

/**
 * Parse a user-provided time input and return a Unix timestamp (seconds).
 *
 * Supported formats:
 * - "HH:MM" / "HH:MM:SS"  — wall-clock time-of-day. If `timezone` is provided
 *                            and valid (IANA name), interpreted in that zone;
 *                            otherwise UTC. Rolled forward 24h if already past.
 *                            Defaults to :59 seconds when omitted.
 * - "in HH:MM:SS hrs.at HH:MM:SS"  — Travian's literal Movements paste; uses
 *                                     the travel duration (first triplet) and
 *                                     adds it to now. Timezone-independent.
 *
 * Returns null if the input doesn't match any supported format.
 */
export function parseTimeToTimestamp(
  input: string,
  timezone?: string
): number | null {
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

  // Simple time-of-day: HH:MM or HH:MM:SS
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

  const useTz = timezone && isValidTimezone(timezone) ? timezone : null;

  if (useTz) {
    const now = new Date();
    const { year, month, day } = getZonedDateParts(useTz, now);
    let candidate = zonedWallClockToUtc(
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
      useTz
    );
    if (candidate <= now.getTime()) {
      // Increment wall-clock day (DST-safe)
      const nextDay = new Date(Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000);
      const nextParts = {
        year: nextDay.getUTCFullYear(),
        month: nextDay.getUTCMonth() + 1,
        day: nextDay.getUTCDate(),
      };
      candidate = zonedWallClockToUtc(
        nextParts.year,
        nextParts.month,
        nextParts.day,
        hours,
        minutes,
        seconds,
        useTz
      );
    }
    return Math.floor(candidate / 1000);
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
 * or fall back to the raw trimmed input wrapped in parens. The optional
 * `timezone` is forwarded to `parseTimeToTimestamp` for wall-clock inputs.
 */
export function formatTimeDisplay(input: string, timezone?: string): string {
  const timestamp = parseTimeToTimestamp(input, timezone);
  if (timestamp !== null) {
    return `<t:${timestamp}:R>`;
  }
  return `(${input.trim()})`;
}

/**
 * Format a Unix timestamp (seconds) as a `HH:MM:SS` wall-clock string in the
 * given IANA timezone. Falls back to UTC if the timezone is missing or invalid.
 */
export function formatRawTime(timestamp: number, timezone?: string): string {
  const useTz = timezone && isValidTimezone(timezone) ? timezone : "UTC";
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: useTz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return dtf.format(new Date(timestamp * 1000));
}

/**
 * Format a Unix timestamp as `<t:ts:R> (HH:MM:SS)` — Discord relative
 * timestamp followed by the wall-clock time in the server timezone.
 */
export function formatRelativeWithRaw(
  timestamp: number,
  timezone?: string
): string {
  return `<t:${timestamp}:R> (${formatRawTime(timestamp, timezone)})`;
}
