import {
  updateRequest,
  getRequestById,
  DefenseRequest,
} from "../services/defense-requests";
import { recordAction } from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { clipNote } from "../utils/format";
import { ActionContext, UpdateDefActionInput, UpdateDefActionResult } from "./types";
import { formatTroops } from "../utils/format";

/**
 * Execute the "updatedef" action - update a defense request (admin).
 *
 * This is the centralized business logic. All interfaces (slash, text)
 * call this function after parsing their inputs.
 */
export async function executeUpdateDefAction(
  context: ActionContext,
  input: UpdateDefActionInput
): Promise<UpdateDefActionResult> {
  const { guildId, client, userId } = context;
  const { requestId, troopsSent, troopsNeeded } = input;
  const message = input.message === undefined ? undefined : clipNote(input.message);

  // 1. Check if at least one update parameter is provided
  if (troopsSent === undefined && troopsNeeded === undefined && message === undefined) {
    return {
      success: false,
      error: "⚠️ **Nothing to update.** Give at least one of troops_sent, troops_needed, or note.",
    };
  }

  // 2. Check if request exists
  const existingRequest = getRequestById(guildId, requestId);
  if (!existingRequest) {
    return { success: false, error: `Request #${requestId} not found.` };
  }

  // 3. Snapshot the request before update for undo support
  const snapshot: DefenseRequest = {
    ...existingRequest,
    contributors: existingRequest.contributors.map((c) => ({ ...c })),
  };

  // 4. Build update object
  const updates: { troopsSent?: number; troopsNeeded?: number; message?: string } = {};
  if (troopsSent !== undefined) updates.troopsSent = troopsSent;
  if (troopsNeeded !== undefined) updates.troopsNeeded = troopsNeeded;
  if (message !== undefined) updates.message = message;

  // 5. Calculate if this update will complete the request
  const newTroopsSent = troopsSent !== undefined ? troopsSent : existingRequest.troopsSent;
  const newTroopsNeeded = troopsNeeded !== undefined ? troopsNeeded : existingRequest.troopsNeeded;
  const willComplete = newTroopsSent >= newTroopsNeeded;

  // 6. Update the request
  const result = updateRequest(guildId, requestId, updates);
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  // 7. Record the action for undo support
  const actionId = recordAction(guildId, {
    type: "ADMIN_UPDATE",
    userId,
    coords: { x: snapshot.x, y: snapshot.y },
    requestId,
    previousState: snapshot,
    data: {
      previousTroopsSent: snapshot.troopsSent,
      previousTroopsNeeded: snapshot.troopsNeeded,
      previousMessage: snapshot.message,
      adminDidComplete: willComplete,
    },
  });

  // 8. Build updated fields list
  const updatedFields: string[] = [];
  if (troopsSent !== undefined) updatedFields.push(`troops sent: ${formatTroops(troopsSent)}`);
  if (troopsNeeded !== undefined) updatedFields.push(`needs troops: ${formatTroops(troopsNeeded)}`);
  if (message !== undefined) updatedFields.push(`note: "${message}"`);

  // 10. Build action text
  const actionText = `<@${userId}> updated request #${requestId}: ${updatedFields.join(", ")}`;
  const confirmText = `✅ Updated request #${requestId}: ${updatedFields.join(", ")}.`;

  // 11. Update the global message and post the audit line
  await updateGlobalMessage(client, guildId, { text: actionText, undoId: actionId });

  return {
    success: true,
    actionId,
    actionText,
    confirmText,
    requestId,
    updatedFields,
    wasCompleted: willComplete,
    request: result,
  };
}
