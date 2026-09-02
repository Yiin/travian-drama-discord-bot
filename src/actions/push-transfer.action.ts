import { transferContribution, getPushRequestById, PushRequest } from "../services/push-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { updatePushChannelEmbed, postContributionMessage } from "../services/push-message";
import { transferContributionStats } from "../services/push-stats";
import { ActionContext, PushTransferActionInput, PushTransferActionResult } from "./types";
import { recordAction } from "../services/action-history";
import { formatResources } from "../utils/format";

/**
 * Execute the "push transfer" action - transfer contribution from one player to another.
 */
export async function executePushTransferAction(
  context: ActionContext,
  input: PushTransferActionInput
): Promise<PushTransferActionResult> {
  const { guildId, config, client, userId } = context;
  const { requestId, fromAccount, toAccount } = input;

  // 1. Get request before transfer (deep copy for undo)
  const request = getPushRequestById(guildId, requestId);
  if (!request) {
    return { success: false, error: `Push request #${requestId} not found.` };
  }
  const previousState: PushRequest = {
    ...request,
    contributors: request.contributors.map(c => ({ ...c })),
  };

  // 2. Perform the transfer
  const result = transferContribution(guildId, requestId, fromAccount, toAccount);
  if (!result.success) {
    return { success: false, error: result.error! };
  }

  const transferredAmount = result.transferredAmount!;

  // 3. Transfer stats
  transferContributionStats(guildId, fromAccount, toAccount, request.x, request.y, transferredAmount);

  // 4. Get village info for display
  const village = await getVillageAt(config.serverKey!, request.x, request.y);

  // 5. Record action for undo
  const actionId = recordAction(guildId, {
    type: "PUSH_CONTRIBUTION_TRANSFER",
    userId,
    coords: { x: request.x, y: request.y },
    requestId,
    previousPushState: previousState,
    data: {
      fromAccount,
      toAccount,
      transferredAmount,
    },
  });

  // 6. Build action text
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${request.x}|${request.y})`;
  const actionText = `<@${userId}> transferred **${formatResources(transferredAmount)}** from **${fromAccount}** to **${toAccount}** (${villageDisplay})`;

  // 7. Post transfer notification in the channel and update embed
  await postContributionMessage(
    client,
    result.request!,
    `🔄 Transferred contribution: **${fromAccount}** → **${toAccount}** (**${formatResources(transferredAmount)}**)`
  );
  await updatePushChannelEmbed(client, guildId, result.request!);

  return {
    success: true,
    actionId,
    actionText,
    requestId,
    fromAccount,
    toAccount,
    transferredAmount,
    coords: { x: request.x, y: request.y },
  };
}

