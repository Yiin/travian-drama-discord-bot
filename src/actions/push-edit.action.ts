import { updatePushRequest, getPushRequestById } from "../services/push-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { updatePushGlobalMessage, PushLastActionInfo } from "../services/push-message";
import { ActionContext, PushEditActionInput, PushEditActionResult } from "./types";

/**
 * Execute the "push edit" action - edit a push request's amount.
 */
export async function executePushEditAction(
  context: ActionContext,
  input: PushEditActionInput
): Promise<PushEditActionResult> {
  const { guildId, config, client, userId } = context;
  const { requestId, resourcesNeeded } = input;

  // 1. Get request before edit
  const request = getPushRequestById(guildId, requestId);
  if (!request) {
    return { success: false, error: `Push užklausa #${requestId} nerasta.` };
  }

  const oldAmount = request.resourcesNeeded;

  // 2. Update the request
  const result = updatePushRequest(guildId, requestId, { resourcesNeeded });
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  // 3. Get village info for display
  const village = await getVillageAt(config.serverKey!, request.x, request.y);

  // 4. Build action text
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${request.x}|${request.y})`;
  const actionText = `<@${userId}> pakeitė push užklausą #${requestId} (${villageDisplay}): ${formatNumber(oldAmount)} → ${formatNumber(resourcesNeeded)}`;

  // 5. Update global message
  const lastAction: PushLastActionInfo = { text: actionText };
  await updatePushGlobalMessage(client, guildId, lastAction);

  return {
    success: true,
    actionId: 0,
    actionText,
    requestId,
    oldAmount,
    newAmount: resourcesNeeded,
    coords: { x: request.x, y: request.y },
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
