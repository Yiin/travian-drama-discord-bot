import { removePushRequest, getPushRequestById, PushRequest } from "../services/push-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { deletePushChannel } from "../services/push-message";
import { ActionContext, PushDeleteActionInput, PushDeleteActionResult } from "./types";

/**
 * Execute the "push delete" action - admin-only hard delete of a push request and its thread.
 * Not undoable; use "close" for the normal case.
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
    return { success: false, error: `Push request #${requestId} not found.` };
  }
  const previousState: PushRequest = {
    ...request,
    contributors: [...request.contributors],
  };

  // 2. Get village info for display
  const village = await getVillageAt(config.serverKey!, request.x, request.y);

  // 3. Delete the push channel
  await deletePushChannel(client, request);

  // 4. Remove the request from data
  const removed = removePushRequest(guildId, requestId);
  if (!removed) {
    return { success: false, error: `Failed to delete push request #${requestId}.` };
  }

  // 5. Hard delete is not undoable; nothing is recorded.
  const actionId = 0;
  void previousState;

  // 6. Build action text
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${request.x}|${request.y})`;
  const actionText = `<@${userId}> deleted push request: ${villageDisplay}`;

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
