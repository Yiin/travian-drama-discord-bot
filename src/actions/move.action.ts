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
  await updateGlobalMessage(client, guildId);

  // 3. Build action text
  const actionText = `<@${userId}> perkėlė užklausą #${fromPosition} į poziciją #${toPosition}.`;

  return {
    success: true,
    actionText,
    fromPosition,
    toPosition,
  };
}
