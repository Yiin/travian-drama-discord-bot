import { getGuildConfig, GuildConfig } from "../config/guild-config";
import { getPushRequestById, getPushRequestsByCoords } from "../services/push-requests";
import { getAccountForUser } from "../services/player-accounts";
import { parseCoords } from "../utils/parse-coords";
import { errors } from "./messages";

/**
 * Result from push config validation - either valid context or error
 */
export type PushConfigValidation =
  | { valid: true; guildId: string; config: GuildConfig }
  | { valid: false; error: string };

/**
 * Validates guild configuration for push actions.
 * Returns a validated context or an error message.
 */
export function validatePushConfig(guildId: string | null): PushConfigValidation {
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

  if (!config.pushChannelId) {
    return {
      valid: false,
      error: errors.channelMissing("push"),
    };
  }

  return { valid: true, guildId, config };
}

/**
 * Result from account validation
 */
export type AccountValidation =
  | { valid: true; accountName: string }
  | { valid: false; error: string };

/**
 * Validates that a user has a linked game account.
 */
export function validateUserHasAccount(guildId: string, userId: string): AccountValidation {
  const accountName = getAccountForUser(guildId, userId);

  if (!accountName) {
    return {
      valid: false,
      error: errors.accountNotLinked(),
    };
  }

  return { valid: true, accountName };
}

/**
 * Result from push target resolution
 */
export type PushTargetResolution =
  | { success: true; requestId: number }
  | { success: false; error: string };

/**
 * Resolves a target string (ID or coordinates) to a push request ID.
 */
export function resolvePushTarget(guildId: string, targetInput: string): PushTargetResolution {
  // Try coordinates first
  const coords = parseCoords(targetInput);
  if (coords) {
    const matches = getPushRequestsByCoords(guildId, coords.x, coords.y);
    if (matches.length === 0) {
      return {
        success: false,
        error: `No active push request found at coordinates (${coords.x}|${coords.y}).`,
      };
    }
    if (matches.length > 1) {
      const ids = matches.map((m) => `#${m.requestId}`).join(", ");
      return {
        success: false,
        error: `⚠️ **${matches.length} push requests share these coordinates.** Use the request id instead: ${ids}.`,
      };
    }
    return { success: true, requestId: matches[0].requestId };
  }

  // Try as numeric ID
  const parsed = parseInt(targetInput.replace(/^#/, ""), 10);
  if (isNaN(parsed) || parsed < 1) {
    return {
      success: false,
      error: "⚠️ **That is not a push request.** Give a request id (for example `9`) or coordinates (for example `123|456`).",
    };
  }

  const existingRequest = getPushRequestById(guildId, parsed);
  if (!existingRequest) {
    return { success: false, error: errors.notFound("push request", parsed) };
  }

  return { success: true, requestId: parsed };
}
