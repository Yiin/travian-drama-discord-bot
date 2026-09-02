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
import { addScoutRequest, getScoutRequest, pruneScoutRequests, ScoutRequest } from "../services/scout-requests";
import { postScoutCard } from "../services/scout-message";
import { recordAction } from "../services/action-history";

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

export interface PostedScout {
  request: ScoutRequest;
  /** Action id for undo (removes the card). */
  actionId: number;
}

/**
 * Store the request, post its card to the scout channel and record the action
 * for undo. Returns null when the channel is unreachable.
 */
export async function sendScoutMessage(
  client: Client,
  guildId: string,
  scoutChannelId: string,
  data: ScoutActionSuccess & { message: string; requesterId: string; scoutRoleId?: string }
): Promise<PostedScout | null> {
  const created = addScoutRequest(guildId, {
    channelId: scoutChannelId,
    x: data.coords.x,
    y: data.coords.y,
    note: data.message,
    requesterId: data.requesterId,
    scoutRoleId: data.scoutRoleId,
  });
  pruneScoutRequests(guildId);
  const posted = await postScoutCard(client, guildId, created);
  if (!posted) return null;
  const request = getScoutRequest(guildId, created.id) ?? created;
  const actionId = recordAction(guildId, {
    type: "SCOUT_REQUEST_ADD",
    userId: data.requesterId,
    coords: { x: request.x, y: request.y },
    requestId: request.id,
    data: { channelIdForCard: request.channelId, messageId: request.messageId },
  });
  return { request, actionId };
}

type ScoutActionSuccess = Exclude<ScoutActionResult, ActionError>;
