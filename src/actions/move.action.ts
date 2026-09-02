import { moveRequest, getRequestById, getRequestPosition } from "../services/defense-requests";
import { updateGlobalMessage } from "../services/defense-message";
import { recordAction } from "../services/action-history";
import { ActionContext, MoveActionInput, MoveActionResult } from "./types";

/**
 * Execute the "move" action - move a defense request to a different position.
 */
export async function executeMoveAction(
  context: ActionContext,
  input: MoveActionInput
): Promise<MoveActionResult> {
  const { guildId, client, userId } = context;
  const { requestId, toPosition } = input;

  const request = getRequestById(guildId, requestId);
  const fromPosition = getRequestPosition(guildId, requestId);

  // 1. Execute the move
  const result = moveRequest(guildId, requestId, toPosition);
  if (!result.success) {
    return { success: false, error: result.error! };
  }

  // 2. Record for undo
  const actionId = recordAction(guildId, {
    type: "REQUEST_MOVED",
    userId,
    coords: { x: request?.x ?? 0, y: request?.y ?? 0 },
    requestId,
    data: { fromPosition, toPosition },
  });

  // 3. Build action text, update the global message, post the audit line
  const actionText = `<@${userId}> moved request #${requestId} to position ${toPosition}`;
  const confirmText = `✅ Moved request #${requestId} to position ${toPosition}.`;
  await updateGlobalMessage(client, guildId, { text: actionText, undoId: actionId });

  return {
    success: true,
    actionId,
    actionText,
    confirmText,
    requestId,
    toPosition,
  };
}
