import { updatePushRequest, getPushRequestById, PushRequest } from "../services/push-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { updatePushGlobalMessage, PushLastActionInfo } from "../services/push-message";
import { ActionContext, PushEditActionInput, PushEditActionResult } from "./types";
import { recordAction } from "../services/action-history";

/**
 * Execute the "push edit" action - edit a push request's amount.
 */
export async function executePushEditAction(
  context: ActionContext,
  input: PushEditActionInput
): Promise<PushEditActionResult> {
  const { guildId, config, client, userId } = context;
  const { requestId, resourcesNeeded } = input;

  // 1. Get request before edit (deep copy for undo)
  const request = getPushRequestById(guildId, requestId);
  if (!request) {
    return { success: false, error: `Push užklausa #${requestId} nerasta.` };
  }
  const previousState: PushRequest = {
    ...request,
    contributors: [...request.contributors],
  };

  const oldAmount = request.resourcesNeeded;

  // 2. Update the request
  const result = updatePushRequest(guildId, requestId, { resourcesNeeded });
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  // 3. Get village info for display
  const village = await getVillageAt(config.serverKey!, request.x, request.y);

  // 4. Record action for undo
  const actionId = recordAction(guildId, {
    type: "PUSH_REQUEST_EDIT",
    userId,
    coords: { x: request.x, y: request.y },
    requestId,
    previousPushState: previousState,
    data: {
      resourcesNeeded,
      previousResourcesNeeded: oldAmount,
    },
  });

  // 5. Build action text
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${request.x}|${request.y})`;
  const actionText = `<@${userId}> pakeitė push užklausą #${requestId} (${villageDisplay}): ${formatNumber(oldAmount)} → ${formatNumber(resourcesNeeded)}`;

  // 6. Update global message with undo reference
  const lastAction: PushLastActionInfo = { text: actionText, undoId: actionId };
  await updatePushGlobalMessage(client, guildId, lastAction);

  return {
    success: true,
    actionId,
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
