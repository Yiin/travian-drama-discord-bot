import { moveRequest } from "../services/defense-requests";
import { updateGlobalMessage } from "../services/defense-message";
import { ActionContext, MoveActionInput, MoveActionResult } from "./types";

/**
 * Execute the "move" action - move a defense request to a different position.
 */
export async function executeMoveAction(
  context: ActionContext,
  input: MoveActionInput
): Promise<MoveActionResult> {
  const { guildId, client, userId } = context;
  const { fromPosition, toPosition } = input;

  // 1. Execute the move
  const result = moveRequest(guildId, fromPosition, toPosition);
  if (!result.success) {
    return { success: false, error: result.error! };
  }

  // 2. Update the global message
  // 3. Build action text, update the global message, post the audit line
  const actionText = `<@${userId}> moved request #${fromPosition} to position #${toPosition}`;
  const confirmText = `✅ Moved request #${fromPosition} to position #${toPosition}.`;
  await updateGlobalMessage(client, guildId, { text: actionText, undoId: 0 });

  return {
    success: true,
    actionText,
    confirmText,
    fromPosition,
    toPosition,
  };
}
