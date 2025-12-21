import {
  reportTroopsSent,
  getRequestById,
  DefenseRequest,
} from "../services/defense-requests";
import { getMapLink, getVillageAt } from "../services/map-data";
import { recordAction } from "../services/action-history";
import { updateGlobalMessage, LastActionInfo } from "../services/defense-message";
import { resolveTarget } from "./validation";
import { ActionContext, SentActionInput, SentActionResult } from "./types";

/**
 * Execute the "sent" action - report troops sent to a defense request.
 *
 * This is the centralized business logic. All interfaces (slash, modal, text)
 * call this function after parsing their inputs.
 */
export async function executeSentAction(
  context: ActionContext,
  input: SentActionInput
): Promise<SentActionResult> {
  const { guildId, config, client, userId } = context;
  const { target, troops, creditUserId } = input;

  // 1. Resolve target to request ID
  const targetResult = resolveTarget(guildId, target);
  if (!targetResult.success) {
    return { success: false, error: targetResult.error };
  }
  const { requestId } = targetResult;

  // 2. Snapshot request before modification (for undo)
  const requestBefore = getRequestById(guildId, requestId);
  if (!requestBefore) {
    return { success: false, error: `Užklausa #${requestId} nerasta.` };
  }
  const snapshot: DefenseRequest = {
    ...requestBefore,
    contributors: requestBefore.contributors.map((c) => ({ ...c })),
  };

  // 3. Perform the operation
  const result = reportTroopsSent(guildId, requestId, creditUserId, troops);
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  // 4. Record action for undo support
  const actionId = recordAction(guildId, {
    type: "TROOPS_SENT",
    userId,
    coords: { x: snapshot.x, y: snapshot.y },
    previousState: snapshot,
    data: {
      troops,
      contributorId: creditUserId,
      didComplete: result.isComplete,
    },
  });

  // 5. Get village info for display
  const village = await getVillageAt(
    config.serverKey!,
    result.request.x,
    result.request.y
  );
  const villageName = village?.villageName || "Nežinomas";

  // 6. Build action text
  const creditUser = `<@${creditUserId}>`;
  let actionText: string;
  if (result.isComplete) {
    actionText = `${creditUser} užbaigė **${villageName}** [(${result.request.x}|${result.request.y})[${getMapLink(config.serverKey!, result.request)}]] - **${result.request.troopsSent}/${result.request.troopsNeeded}**`;
  } else {
    actionText = `${creditUser} išsiuntė **${troops}** į **${villageName}** [(${result.request.x}|${result.request.y})[${getMapLink(config.serverKey!, result.request)}]] - **${result.request.troopsSent}/${result.request.troopsNeeded}**`;
  }

  // 7. Update global message
  const lastAction: LastActionInfo = { text: actionText, undoId: actionId };
  await updateGlobalMessage(client, guildId, lastAction);

  return {
    success: true,
    actionId,
    actionText,
    villageName,
    troopsSent: result.request.troopsSent,
    troopsNeeded: result.request.troopsNeeded,
    isComplete: result.isComplete,
    coords: { x: result.request.x, y: result.request.y },
  };
}
