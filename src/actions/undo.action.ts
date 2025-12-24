import {
  undoAction as performUndo,
  getAction,
  getActionDescription,
  isPushAction,
} from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { updatePushGlobalMessage } from "../services/push-message";
import { removeContribution } from "../services/stats";
import { removePushContribution } from "../services/push-stats";
import { ActionContext, UndoActionInput, UndoActionResult } from "./types";

/**
 * Execute the "undo" action - undo a previous action.
 *
 * This is the centralized business logic. All interfaces (slash, text)
 * call this function after parsing their inputs.
 */
export async function executeUndoAction(
  context: ActionContext,
  input: UndoActionInput
): Promise<UndoActionResult> {
  const { guildId, client, userId } = context;
  const { actionId } = input;

  // 1. Get the action to show what we're undoing
  const action = getAction(guildId, actionId);
  if (!action) {
    return { success: false, error: `Veiksmas #${actionId} nerastas.` };
  }

  // 2. Perform the undo
  const result = performUndo(guildId, actionId);
  if (!result.success) {
    return { success: false, error: result.message };
  }

  // 3. Reverse stats contribution if this was a TROOPS_SENT action
  if (action.type === "TROOPS_SENT" && action.data.troops && action.data.contributorId) {
    removeContribution(
      guildId,
      action.data.contributorId,
      action.coords.x,
      action.coords.y,
      action.data.troops
    );
  }

  // 3b. Reverse push stats contribution if this was a PUSH_RESOURCES_SENT action
  if (action.type === "PUSH_RESOURCES_SENT" && action.data.resources && action.data.contributorAccount) {
    removePushContribution(
      guildId,
      action.data.contributorAccount,
      action.coords.x,
      action.coords.y,
      action.data.resources
    );
  }

  // 4. Update the appropriate global message based on action type
  if (isPushAction(action)) {
    await updatePushGlobalMessage(client, guildId);
  } else {
    await updateGlobalMessage(client, guildId);
  }

  // 5. Get description of what was undone
  const description = getActionDescription(action);

  // 6. Build action text
  const actionText = `<@${userId}> atšaukė veiksmą #${actionId}: ${description}`;

  return {
    success: true,
    actionId, // Using the same actionId for reference
    actionText,
    description,
  };
}
