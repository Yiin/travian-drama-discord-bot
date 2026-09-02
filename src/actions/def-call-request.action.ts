import { addRequest } from "../services/def-calls";
import {
  getVillageAt,
  ensureMapData,
  formatVillageDisplay,
} from "../services/map-data";
import { recordAction } from "../services/action-history";
import {
  createDefCallThread,
  refreshHubChannel,
} from "../services/def-calls-message";
import { parseAndValidateCoords } from "./validation";
import { validateUserHasAccount } from "./push-validation";
import { parseTimeToTimestamp, formatRelativeWithRaw } from "../utils/time";
import {
  ActionContext,
  DefCallRequestActionInput,
  DefCallRequestActionResult,
} from "./types";
import { errors } from "./messages";

export async function executeDefCallRequestAction(
  context: ActionContext,
  input: DefCallRequestActionInput
): Promise<DefCallRequestActionResult> {
  const { guildId, config, client, userId } = context;
  const { coords: coordsInput, landing, comment, troopsNeeded } = input;

  if (troopsNeeded !== undefined && (!Number.isFinite(troopsNeeded) || troopsNeeded < 1)) {
    return {
      success: false,
      error: errors.invalidCount("troops for the limit"),
    };
  }

  if (!config.serverKey) {
    return {
      success: false,
      error:
        errors.notSetUp(),
    };
  }

  if (!config.defCallsChannelId) {
    return {
      success: false,
      error:
        errors.channelMissing("defcalls"),
    };
  }

  const accountResult = validateUserHasAccount(guildId, userId);
  if (!accountResult.valid) {
    return { success: false, error: accountResult.error };
  }
  const { accountName } = accountResult;

  const coordsResult = parseAndValidateCoords(coordsInput);
  if (!coordsResult.success) {
    return { success: false, error: coordsResult.error };
  }
  const { x, y } = coordsResult;

  const landingAt = parseTimeToTimestamp(landing, config.serverTimezone);
  if (landingAt === null) {
    return {
      success: false,
      error: `Unrecognized landing time: "${landing}". Use HH:MM, HH:MM:SS, or Travian format "in HH:MM:SS hrs.at HH:MM:SS".`,
    };
  }

  const dataReady = await ensureMapData(config.serverKey);
  if (!dataReady) {
    return {
      success: false,
      error: errors.mapUnavailable(),
    };
  }

  const village = await getVillageAt(config.serverKey, x, y);

  const result = addRequest(
    guildId,
    x,
    y,
    landingAt,
    userId,
    accountName,
    comment,
    troopsNeeded
  );

  let channelId: string;
  try {
    const channelResult = await createDefCallThread(
      client,
      guildId,
      result.request,
      result.requestId
    );
    channelId = channelResult.channelId;
  } catch (error) {
    console.error("[DefCallRequest] Failed to create channel:", error);
    return {
      success: false,
      error: "Failed to create the channel. Try again.",
    };
  }

  await refreshHubChannel(client, guildId);

  const actionId = recordAction(guildId, {
    type: "DEF_CALL_REQUEST_ADD",
    userId,
    coords: { x, y },
    requestId: result.requestId,
    data: {
      contributorAccount: accountName,
      channelId,
    },
  });

  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey, village)
    : `(${x}|${y})`;
  const actionText = `**${accountName}** created a defense request: ${villageDisplay} — lands ${formatRelativeWithRaw(landingAt, config.serverTimezone)}. <#${channelId}>`;

  return {
    success: true,
    actionId,
    actionText,
    confirmText: `✅ Defense request created for ${villageDisplay}, lands ${formatRelativeWithRaw(landingAt, config.serverTimezone)}. Report in <#${channelId}>.`,
    requestId: result.requestId,
    villageName: village?.villageName ?? "Unknown",
    playerName: village?.playerName ?? "Unknown",
    coords: { x, y },
    channelId,
    landingAt,
  };
}
