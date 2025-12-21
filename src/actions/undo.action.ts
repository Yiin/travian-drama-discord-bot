import {
  undoAction as performUndo,
  getAction,
  getActionDescription,
} from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
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

  // 3. Update the global message
  await updateGlobalMessage(client, guildId);

  // 4. Get description of what was undone
  const description = getActionDescription(action);

  // 5. Build action text
  const actionText = `<@${userId}> atšaukė veiksmą #${actionId}: ${description}`;

  return {
    success: true,
    actionId, // Using the same actionId for reference
    actionText,
    description,
  };
}
