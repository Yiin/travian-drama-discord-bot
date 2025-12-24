import { removePushRequest, getPushRequestById, PushRequest } from "../services/push-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { updatePushGlobalMessage, PushLastActionInfo } from "../services/push-message";
import { ActionContext, PushDeleteActionInput, PushDeleteActionResult } from "./types";
import { recordAction } from "../services/action-history";

/**
 * Execute the "push delete" action - delete a push request.
 */
export async function executePushDeleteAction(
  context: ActionContext,
  input: PushDeleteActionInput
): Promise<PushDeleteActionResult> {
  const { guildId, config, client, userId } = context;
  const { requestId } = input;

  // 1. Get request before deletion (deep copy for undo)
  const request = getPushRequestById(guildId, requestId);
  if (!request) {
    return { success: false, error: `Push užklausa #${requestId} nerasta.` };
  }
  const previousState: PushRequest = {
    ...request,
    contributors: [...request.contributors],
  };

  // 2. Get village info for display
  const village = await getVillageAt(config.serverKey!, request.x, request.y);

  // 3. Remove the request
  const removed = removePushRequest(guildId, requestId);
  if (!removed) {
    return { success: false, error: `Nepavyko ištrinti push užklausos #${requestId}.` };
  }

  // 4. Record action for undo
  const actionId = recordAction(guildId, {
    type: "PUSH_REQUEST_DELETED",
    userId,
    coords: { x: request.x, y: request.y },
    requestId,
    previousPushState: previousState,
    data: {},
  });

  // 5. Build action text
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${request.x}|${request.y})`;
  const actionText = `<@${userId}> ištrynė push užklausą #${requestId}: ${villageDisplay}`;

  // 6. Update global message with undo reference
  const lastAction: PushLastActionInfo = { text: actionText, undoId: actionId };
  await updatePushGlobalMessage(client, guildId, lastAction);

  return {
    success: true,
    actionId,
    actionText,
    requestId,
    villageName: village?.villageName ?? "Unknown",
    playerName: village?.playerName ?? "Unknown",
    coords: { x: request.x, y: request.y },
  };
}
