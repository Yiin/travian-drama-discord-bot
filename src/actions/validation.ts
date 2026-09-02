import { getGuildConfig, GuildConfig } from "../config/guild-config";
import { getRequestById, getRequestsByCoords } from "../services/defense-requests";
import { parseCoords } from "../utils/parse-coords";
import { ConfigValidation } from "./types";
import { errors } from "./messages";

/**
 * Validates guild configuration for defense actions.
 * Returns a validated context or an error message.
 */
export function validateDefenseConfig(guildId: string | null): ConfigValidation {
  if (!guildId) {
    return { valid: false, error: errors.guildOnly() };
  }

  const config = getGuildConfig(guildId);

  if (!config.serverKey) {
    return {
      valid: false,
      error: errors.notSetUp(),
    };
  }

  if (!config.defenseChannelId) {
    return {
      valid: false,
      error: errors.channelMissing("defense"),
    };
  }

  return { valid: true, guildId, config };
}

/**
 * Result from target resolution
 */
export type TargetResolution =
  | { success: true; requestId: number }
  | { success: false; error: string };

/**
 * Resolves a target string (ID or coordinates) to a request ID.
 */
export function resolveTarget(guildId: string, targetInput: string): TargetResolution {
  // Try coordinates first
  const coords = parseCoords(targetInput);
  if (coords) {
    const matches = getRequestsByCoords(guildId, coords.x, coords.y);
    if (matches.length === 0) {
      return {
        success: false,
        error: `No active request found at coordinates (${coords.x}|${coords.y}).`,
      };
    }
    if (matches.length > 1) {
      // Multiple requests at same coordinates - require position ID
      const ids = matches.map((m) => m.requestId).join(", ");
      return {
        success: false,
        error: `There are ${matches.length} requests at these coordinates. Use the queue number (${ids}).`,
      };
    }
    return { success: true, requestId: matches[0].requestId };
  }

  // Try as numeric ID
  const parsed = parseInt(targetInput, 10);
  if (isNaN(parsed) || parsed < 1) {
    return {
      success: false,
      error: "Invalid input. Provide a request ID (for example, 1) or coordinates (for example, 123|456).",
    };
  }

  const existingRequest = getRequestById(guildId, parsed);
  if (!existingRequest) {
    return { success: false, error: errors.notFound("request", parsed) };
  }

  return { success: true, requestId: parsed };
}

/**
 * Result from coordinate parsing and validation
 */
export type CoordsValidation =
  | { success: true; x: number; y: number }
  | { success: false; error: string };

/**
 * Parses and validates coordinates from a string.
 */
export function parseAndValidateCoords(coordsInput: string): CoordsValidation {
  const coords = parseCoords(coordsInput);
  if (!coords) {
    return {
      success: false,
      error: errors.invalidCoords(),
    };
  }
  return { success: true, x: coords.x, y: coords.y };
}
