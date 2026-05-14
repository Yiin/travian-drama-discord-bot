import {
  reportTroopsSent,
  getRequestById,
  DefCallRequest,
} from "../services/def-calls";
import { recordContribution } from "../services/stats";
import { recordAction } from "../services/action-history";
import {
  updateDefCallChannelEmbed,
  postDefCallContributionMessage,
  refreshHubChannel,
} from "../services/def-calls-message";
import { validateUserHasAccount } from "./push-validation";
import {
  ActionContext,
  DefCallSentActionInput,
  DefCallSentActionResult,
} from "./types";

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}

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
        error: `<@${creditUserId}> does not have a linked in-game account.`,
      };
    }
    return { success: false, error: accountResult.error };
  }
  const { accountName } = accountResult;

  const requestBefore = getRequestById(guildId, requestId);
  if (!requestBefore) {
    return { success: false, error: `Request #${requestId} not found.` };
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

  await postDefCallContributionMessage(
    client,
    result.request,
    `**${accountName}** sent **${formatNumber(troops)}** troops`
  );
  await updateDefCallChannelEmbed(client, guildId, result.request);
  await refreshHubChannel(client, guildId);

  const actionText = `**${accountName}** sent **${formatNumber(troops)}** troops to (${result.request.x}|${result.request.y})`;

  return {
    success: true,
    actionId,
    actionText,
    requestId,
    troopsSent: troops,
    totalTroops: result.request.troopsSent,
    coords: { x: result.request.x, y: result.request.y },
  };
}
