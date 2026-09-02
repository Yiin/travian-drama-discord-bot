import { Client } from "discord.js";
import {
  getVillageAt,
  ensureMapData,
  getRallyPointLink,
  formatVillageDisplay,
} from "../services/map-data";
import { parseAndValidateCoords } from "./validation";
import { ActionContext, ScoutActionInput, ScoutActionResult, ActionError } from "./types";
import { errors } from "./messages";
import { addScoutRequest, pruneScoutRequests, ScoutRequest } from "../services/scout-requests";
import { postScoutCard } from "../services/scout-message";

/**
 * Execute the "scout" action - validate coordinates and get village info.
 *
 * This is the centralized business logic. All interfaces (slash, text)
 * call this function after parsing their inputs.
 */
export async function executeScoutAction(
  context: ActionContext,
  input: ScoutActionInput
): Promise<ScoutActionResult> {
  const { config } = context;
  const { coords: coordsInput } = input;

  // 1. Parse and validate coordinates
  const coordsResult = parseAndValidateCoords(coordsInput);
  if (!coordsResult.success) {
    return { success: false, error: coordsResult.error };
  }
  const { x, y } = coordsResult;

  // 2. Ensure map data is available
  const dataReady = await ensureMapData(config.serverKey!);
  if (!dataReady) {
    return {
      success: false,
      error: errors.mapUnavailable(),
    };
  }

  // 3. Get village info (may be null for new/unknown villages)
  const village = await getVillageAt(config.serverKey!, x, y);

  // 4. Get rally link and formatted display
  // For unknown villages, we can't generate a rally link (no targetMapId)
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${x}|${y}) Unknown/new village`;

  return {
    success: true,
    villageName: village?.villageName ?? "Unknown/new village",
    playerName: village?.playerName ?? "Unknown",
    population: village?.population ?? 0,
    rallyLink: village ? getRallyPointLink(config.serverKey!, village.targetMapId, 3) : undefined,
    villageDisplay,
    coords: { x, y },
  };
}

/**
 * Store the request and post its card to the scout channel.
 * Returns the stored request, or null when the channel is unreachable.
 */
export async function sendScoutMessage(
  client: Client,
  guildId: string,
  scoutChannelId: string,
  data: ScoutActionSuccess & { message: string; requesterId: string; scoutRoleId?: string }
): Promise<ScoutRequest | null> {
  const request = addScoutRequest(guildId, {
    channelId: scoutChannelId,
    x: data.coords.x,
    y: data.coords.y,
    note: data.message,
    requesterId: data.requesterId,
    scoutRoleId: data.scoutRoleId,
  });
  pruneScoutRequests(guildId);
  const posted = await postScoutCard(client, guildId, request);
  return posted ? request : null;
}

type ScoutActionSuccess = Exclude<ScoutActionResult, ActionError>;
