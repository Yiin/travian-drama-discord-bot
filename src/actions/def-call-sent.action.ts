import {
  reportTroopsSent,
  getRequestById,
  DefCallRequest,
} from "../services/def-calls";
import { recordContribution } from "../services/stats";
import { recordAction } from "../services/action-history";
import {
  updateDefCallCard,
  refreshHubChannel,
} from "../services/def-calls-message";
import { validateUserHasAccount } from "./push-validation";
import {
  ActionContext,
  DefCallSentActionInput,
  DefCallSentActionResult,
} from "./types";
import { formatTroops } from "../utils/format";
import { errors } from "./messages";

export async function executeDefCallSentAction(
  context: ActionContext,
  input: DefCallSentActionInput
): Promise<DefCallSentActionResult> {
  const { guildId, client, userId } = context;
  const { requestId, troops, creditUserId } = input;

  const creditedUserId = creditUserId || userId;
  const accountResult = validateUserHasAccount(guildId, creditedUserId);
  if (!accountResult.valid) {
    if (creditUserId && creditUserId !== userId) {
      return {
        success: false,
        error: errors.otherAccountNotLinked(creditUserId),
      };
    }
    return { success: false, error: accountResult.error };
  }
  const { accountName } = accountResult;

  const requestBefore = getRequestById(guildId, requestId);
  if (!requestBefore) {
    return { success: false, error: errors.notFound("defense call", requestId) };
  }
  if (requestBefore.closed) {
    return { success: false, error: "⚠️ **This defense call is closed.** Undo the close first if it was a mistake." };
  }
  const previousState: DefCallRequest = {
    ...requestBefore,
    contributors: [...requestBefore.contributors],
  };

  const result = reportTroopsSent(guildId, requestId, accountName, troops);
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  recordContribution(
    guildId,
    creditedUserId,
    result.request.x,
    result.request.y,
    troops
  );

  const actionId = recordAction(guildId, {
    type: "DEF_CALL_TROOPS_SENT",
    userId,
    coords: { x: result.request.x, y: result.request.y },
    requestId,
    previousDefCallState: previousState,
    data: {
      troops,
      contributorAccount: accountName,
    },
  });

  await updateDefCallCard(client, guildId, result.request);
  await refreshHubChannel(client, guildId);

  const actionText = `**${accountName}** sent **${formatTroops(troops)}** troops to (${result.request.x}|${result.request.y})`;

  return {
    success: true,
    actionId,
    actionText,
    confirmText: `✅ Added **${formatTroops(troops)}** troops. Total now **${formatTroops(result.request.troopsSent)}**${result.request.troopsNeeded ? ` / ${formatTroops(result.request.troopsNeeded)}` : ""}.`,
    requestId,
    troopsSent: troops,
    totalTroops: result.request.troopsSent,
    coords: { x: result.request.x, y: result.request.y },
  };
}
