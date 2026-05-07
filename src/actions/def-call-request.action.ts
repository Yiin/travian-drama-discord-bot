import { addRequest } from "../services/def-calls";
import {
  getVillageAt,
  ensureMapData,
  formatVillageDisplay,
} from "../services/map-data";
import { recordAction } from "../services/action-history";
import {
  createDefCallChannel,
  refreshHubChannel,
} from "../services/def-calls-message";
import { parseAndValidateCoords } from "./validation";
import { validateUserHasAccount } from "./push-validation";
import { parseTimeToTimestamp } from "../utils/time";
import {
  ActionContext,
  DefCallRequestActionInput,
  DefCallRequestActionResult,
} from "./types";

export async function executeDefCallRequestAction(
  context: ActionContext,
  input: DefCallRequestActionInput
): Promise<DefCallRequestActionResult> {
  const { guildId, config, client, userId } = context;
  const { coords: coordsInput, landing, comment } = input;

  if (!config.serverKey) {
    return {
      success: false,
      error:
        "Travian serveris nesukonfigūruotas. Adminas turi panaudoti `/configure server`.",
    };
  }

  if (!config.defCallsChannelId || !config.defCallsCategoryId) {
    return {
      success: false,
      error:
        "Gynybos kanalai nesukonfigūruoti. Administratorius turi paleisti `/configure def-calls-channel` ir `/configure def-calls-category`.",
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
      error: `Neatpažintas kritimo laikas: "${landing}". Naudok HH:MM, HH:MM:SS arba Travian formatą "in HH:MM:SS hrs.at HH:MM:SS".`,
    };
  }

  const dataReady = await ensureMapData(config.serverKey);
  if (!dataReady) {
    return {
      success: false,
      error: "Nepavyko užkrauti žemėlapio duomenų. Bandyk vėliau.",
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
    comment
  );

  let channelId: string;
  try {
    const channelResult = await createDefCallChannel(
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
      error: "Nepavyko sukurti kanalo. Bandyk dar kartą.",
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
  const actionText = `**${accountName}** sukūrė gynybos prašymą: ${villageDisplay} — leidžiasi <t:${landingAt}:R>. <#${channelId}>`;

  return {
    success: true,
    actionId,
    actionText,
    requestId: result.requestId,
    villageName: village?.villageName ?? "Unknown",
    playerName: village?.playerName ?? "Unknown",
    coords: { x, y },
    channelId,
    landingAt,
  };
}
