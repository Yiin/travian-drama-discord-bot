import {
  reportResourcesSent,
  getPushRequestById,
  PushRequest,
} from "../services/push-requests";
import { getVillageAt, formatVillageDisplay, getMapLink } from "../services/map-data";
import { postContributionMessage, updatePushChannelEmbed, markPushComplete } from "../services/push-message";
import { recordPushContribution } from "../services/push-stats";
import { resolvePushTarget, validateUserHasAccount } from "./push-validation";
import { ActionContext, PushSentActionInput, PushSentActionResult } from "./types";
import { recordAction } from "../services/action-history";

/**
 * Execute the "push sent" action - report resources sent to a push request.
 *
 * This is the centralized business logic. All interfaces (slash, modal)
 * call this function after parsing their inputs.
 */
export async function executePushSentAction(
  context: ActionContext,
  input: PushSentActionInput
): Promise<PushSentActionResult> {
  const { guildId, config, client, userId } = context;
  const { target, resources } = input;

  // 1. Validate user has a linked account
  const accountResult = validateUserHasAccount(guildId, userId);
  if (!accountResult.valid) {
    return { success: false, error: accountResult.error };
  }
  const { accountName } = accountResult;

  // 2. Resolve target to request ID
  const targetResult = resolvePushTarget(guildId, target);
  if (!targetResult.success) {
    return { success: false, error: targetResult.error };
  }
  const { requestId } = targetResult;

  // 3. Get request before modification (deep copy for undo)
  const requestBefore = getPushRequestById(guildId, requestId);
  if (!requestBefore) {
    return { success: false, error: `Push užklausa #${requestId} nerasta.` };
  }
  const previousState: PushRequest = {
    ...requestBefore,
    contributors: [...requestBefore.contributors],
  };

  // 4. Perform the operation
  const result = reportResourcesSent(guildId, requestId, accountName, resources);
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  // 5. Record contribution to stats
  recordPushContribution(guildId, accountName, result.request.x, result.request.y, resources);

  // 6. Get village info for display
  const village = await getVillageAt(
    config.serverKey!,
    result.request.x,
    result.request.y
  );
  const villageName = village?.villageName || "Nežinomas";
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `[(${result.request.x}|${result.request.y})](${getMapLink(config.serverKey!, result.request)})`;

  // 7. Build action text
  let actionText: string;
  if (result.isComplete && !result.wasAlreadyComplete) {
    actionText = `**${accountName}** užbaigė push į ${villageDisplay} - **${formatNumber(result.request.resourcesSent)}/${formatNumber(result.request.resourcesNeeded)}**`;
  } else {
    actionText = `**${accountName}** išsiuntė **${formatNumber(resources)}** į ${villageDisplay} - **${formatNumber(result.request.resourcesSent)}/${formatNumber(result.request.resourcesNeeded)}**`;
  }

  // 8. Record action for undo
  const actionId = recordAction(guildId, {
    type: "PUSH_RESOURCES_SENT",
    userId,
    coords: { x: result.request.x, y: result.request.y },
    requestId,
    previousPushState: previousState,
    data: {
      resources,
      contributorAccount: accountName,
      pushDidComplete: result.isComplete && !result.wasAlreadyComplete,
    },
  });

  // 9. Post contribution message in the push channel
  const contributionText = `**${accountName}** išsiuntė **${formatNumber(resources)}** resursų`;
  await postContributionMessage(client, result.request, contributionText);

  // 10. Update the channel embed or mark complete
  if (result.isComplete && !result.wasAlreadyComplete) {
    await markPushComplete(client, guildId, result.request);
  } else {
    await updatePushChannelEmbed(client, guildId, result.request);
  }

  return {
    success: true,
    actionId,
    actionText,
    villageName,
    resourcesSent: result.request.resourcesSent,
    resourcesNeeded: result.request.resourcesNeeded,
    isComplete: result.isComplete,
    coords: { x: result.request.x, y: result.request.y },
  };
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}
