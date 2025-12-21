import { getGuildConfig, GuildConfig } from "../config/guild-config";
import { getRequestById, getRequestByCoords } from "../services/defense-requests";
import { parseCoords } from "../utils/parse-coords";
import { ConfigValidation } from "./types";

/**
 * Validates guild configuration for defense actions.
 * Returns a validated context or an error message.
 */
export function validateDefenseConfig(guildId: string | null): ConfigValidation {
  if (!guildId) {
    return { valid: false, error: "Ši komanda veikia tik serveryje." };
  }

  const config = getGuildConfig(guildId);

  if (!config.serverKey) {
    return {
      valid: false,
      error: "Travian serveris nesukonfigūruotas. Adminas turi paleisti `/setserver`.",
    };
  }

  if (!config.defenseChannelId) {
    return {
      valid: false,
      error: "Gynybos kanalas nesukonfigūruotas. Adminas turi paleisti `/setchannel type:Defense`.",
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
    const found = getRequestByCoords(guildId, coords.x, coords.y);
    if (!found) {
      return {
        success: false,
        error: `Nerasta aktyvi užklausa koordinatėse (${coords.x}|${coords.y}).`,
      };
    }
    return { success: true, requestId: found.requestId };
  }

  // Try as numeric ID
  const parsed = parseInt(targetInput, 10);
  if (isNaN(parsed) || parsed < 1) {
    return {
      success: false,
      error: "Neteisingas įvedimas. Nurodyk užklausos ID (pvz., 1) arba koordinates (pvz., 123|456).",
    };
  }

  const existingRequest = getRequestById(guildId, parsed);
  if (!existingRequest) {
    return { success: false, error: `Užklausa #${parsed} nerasta.` };
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
      error: "Neteisingos koordinatės. Naudok formatą 123|456.",
    };
  }
  return { success: true, x: coords.x, y: coords.y };
}
