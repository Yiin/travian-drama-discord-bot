import {
  updateRequest,
  getRequestById,
  DefenseRequest,
} from "../services/defense-requests";
import { recordAction } from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { ActionContext, UpdateDefActionInput, UpdateDefActionResult } from "./types";

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
  const { requestId, troopsSent, troopsNeeded, message } = input;

  // 1. Check if at least one update parameter is provided
  if (troopsSent === undefined && troopsNeeded === undefined && message === undefined) {
    return {
      success: false,
      error: "Nurodyk bent vieną lauką atnaujinti (troops_sent, troops_needed arba message).",
    };
  }

  // 2. Check if request exists
  const existingRequest = getRequestById(guildId, requestId);
  if (!existingRequest) {
    return { success: false, error: `Užklausa #${requestId} nerasta.` };
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
    previousState: snapshot,
    data: {
      previousTroopsSent: snapshot.troopsSent,
      previousTroopsNeeded: snapshot.troopsNeeded,
      previousMessage: snapshot.message,
      adminDidComplete: willComplete,
    },
  });

  // 8. Update the global message
  await updateGlobalMessage(client, guildId);

  // 9. Build updated fields list
  const updatedFields: string[] = [];
  if (troopsSent !== undefined) updatedFields.push(`išsiųsta karių: ${troopsSent}`);
  if (troopsNeeded !== undefined) updatedFields.push(`reikia karių: ${troopsNeeded}`);
  if (message !== undefined) updatedFields.push(`žinutė: "${message}"`);

  // 10. Build action text
  const actionText = `<@${userId}> atnaujino užklausą #${requestId}: ${updatedFields.join(", ")}. (\`/undo ${actionId}\`)`;

  return {
    success: true,
    actionId,
    actionText,
    requestId,
    updatedFields,
    wasCompleted: willComplete,
    request: result,
  };
}
