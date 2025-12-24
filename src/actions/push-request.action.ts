import { addPushRequest } from "../services/push-requests";
import { getVillageAt, ensureMapData, formatVillageDisplay } from "../services/map-data";
import { updatePushGlobalMessage } from "../services/push-message";
import { parseAndValidateCoords } from "./validation";
import { validateUserHasAccount } from "./push-validation";
import { ActionContext, PushRequestActionInput, PushRequestActionResult } from "./types";

/**
 * Execute the "push request" action - create a push request.
 *
 * This is the centralized business logic. All interfaces (slash, modal)
 * call this function after parsing their inputs.
 */
export async function executePushRequestAction(
  context: ActionContext,
  input: PushRequestActionInput
): Promise<PushRequestActionResult> {
  const { guildId, config, client, userId } = context;
  const { coords: coordsInput, resourcesNeeded } = input;

  // 1. Validate user has a linked account
  const accountResult = validateUserHasAccount(guildId, userId);
  if (!accountResult.valid) {
    return { success: false, error: accountResult.error };
  }
  const { accountName } = accountResult;

  // 2. Parse and validate coordinates
  const coordsResult = parseAndValidateCoords(coordsInput);
  if (!coordsResult.success) {
    return { success: false, error: coordsResult.error };
  }
  const { x, y } = coordsResult;

  // 3. Ensure map data is available
  const dataReady = await ensureMapData(config.serverKey!);
  if (!dataReady) {
    return {
      success: false,
      error: "Nepavyko užkrauti žemėlapio duomenų. Bandyk vėliau.",
    };
  }

  // 4. Get village info (may be null for new/unknown villages)
  const village = await getVillageAt(config.serverKey!, x, y);

  // 5. Add the request
  const result = addPushRequest(guildId, x, y, resourcesNeeded, userId, accountName);
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  // 6. Update the global message
  await updatePushGlobalMessage(client, guildId);

  // 7. Build action text
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${x}|${y}) Unknown/new village`;
  const allianceInfo = village?.allianceName ? ` [${village.allianceName}]` : "";
  const actionText = `**${accountName}** sukūrė push užklausą #${result.requestId}: ${villageDisplay}${allianceInfo} - reikia ${formatNumber(resourcesNeeded)} resursų.`;

  return {
    success: true,
    actionId: 0, // Push doesn't use undo system yet
    actionText,
    requestId: result.requestId,
    villageName: village?.villageName ?? "Unknown/new village",
    playerName: village?.playerName ?? "Unknown",
    allianceName: village?.allianceName,
    requesterAccount: accountName,
    coords: { x, y },
  };
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}
