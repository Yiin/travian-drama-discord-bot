import { updateContributorResources, getPushRequestById, PushRequest } from "../services/push-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { updatePushChannelEmbed, postContributionMessage } from "../services/push-message";
import { adjustContributionStats } from "../services/push-stats";
import { ActionContext, PushEditContributionActionInput, PushEditContributionActionResult } from "./types";
import { recordAction } from "../services/action-history";
import { formatResources } from "../utils/format";

/**
 * Execute the "push edit contribution" action - edit a contributor's resource amount.
 */
export async function executePushEditContributionAction(
  context: ActionContext,
  input: PushEditContributionActionInput
): Promise<PushEditContributionActionResult> {
  const { guildId, config, client, userId } = context;
  const { requestId, accountName, newAmount } = input;

  // 1. Get request before edit (deep copy for undo)
  const request = getPushRequestById(guildId, requestId);
  if (!request) {
    return { success: false, error: `Push request #${requestId} not found.` };
  }
  const previousState: PushRequest = {
    ...request,
    contributors: request.contributors.map(c => ({ ...c })),
  };

  // 2. Update the contributor's resources
  const result = updateContributorResources(guildId, requestId, accountName, newAmount);
  if (!result.success) {
    return { success: false, error: result.error! };
  }

  const oldAmount = result.previousAmount!;
  const adjustment = newAmount - oldAmount;

  // 3. Adjust stats
  adjustContributionStats(guildId, accountName, request.x, request.y, adjustment);

  // 4. Get village info for display
  const village = await getVillageAt(config.serverKey!, request.x, request.y);

  // 5. Record action for undo
  const actionId = recordAction(guildId, {
    type: "PUSH_CONTRIBUTION_EDIT",
    userId,
    coords: { x: request.x, y: request.y },
    requestId,
    previousPushState: previousState,
    data: {
      accountName,
      oldAmount,
      newAmount,
    },
  });

  // 6. Build action text
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${request.x}|${request.y})`;
  const actionText = `<@${userId}> changed **${accountName}** contribution (${villageDisplay}): ${formatResources(oldAmount)} → ${formatResources(newAmount)}`;

  // 7. Post edit notification in the channel and update embed
  await postContributionMessage(
    client,
    result.request!,
    `📝 Changed **${accountName}** contribution: **${formatResources(oldAmount)}** → **${formatResources(newAmount)}**`
  );
  await updatePushChannelEmbed(client, guildId, result.request!);

  return {
    success: true,
    actionId,
    actionText,
    requestId,
    accountName,
    oldAmount,
    newAmount,
    coords: { x: request.x, y: request.y },
  };
}

