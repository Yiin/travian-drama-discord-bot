import { getRequestById, setContributorTroops } from "../services/def-calls";
import { recordContribution } from "../services/stats";
import { recordAction } from "../services/action-history";
import { updateDefCallCard, refreshHubChannel } from "../services/def-calls-message";
import { validateUserHasAccount } from "./push-validation";
import { ActionContext, DefCallEditActionInput, DefCallEditActionResult } from "./types";
import { formatTroops, ARROW } from "../utils/format";
import { errors } from "./messages";
import { checkPermission } from "./permissions";

/** Set an account's troop total on a defense call, to fix a wrong report. */
export async function executeDefCallEditAction(
  context: ActionContext,
  input: DefCallEditActionInput
): Promise<DefCallEditActionResult> {
  const { guildId, scope, client, userId } = context;
  const { requestId, troops, creditUserId } = input;

  const creditedUserId = creditUserId || userId;
  // Your own total is yours to fix; anyone else's needs manage
  if (creditedUserId !== userId) {
    const denied = checkPermission(context, "manage");
    if (denied) return { success: false, error: denied };
  }

  const accountResult = validateUserHasAccount(guildId, creditedUserId);
  if (!accountResult.valid) {
    if (creditedUserId !== userId) {
      return { success: false, error: errors.otherAccountNotLinked(creditedUserId) };
    }
    return { success: false, error: accountResult.error };
  }
  const { accountName } = accountResult;

  const requestBefore = getRequestById(scope, requestId);
  if (!requestBefore) {
    return { success: false, error: errors.notFound("defense call", requestId) };
  }
  if (requestBefore.closed) {
    return { success: false, error: errors.defCallClosed() };
  }
  if (!requestBefore.contributors.some((c) => c.accountName === accountName)) {
    return { success: false, error: errors.noTroopsReported(accountName) };
  }

  const result = setContributorTroops(scope, requestId, accountName, troops);
  if ("error" in result) {
    return { success: false, error: result.error };
  }
  const { request, previousTroops } = result;

  const delta = troops - previousTroops;
  if (delta !== 0) {
    recordContribution(scope, creditedUserId, request.x, request.y, delta);
  }

  const actionId = recordAction(scope, {
    type: "DEF_CALL_CONTRIBUTION_EDIT",
    userId,
    coords: { x: request.x, y: request.y },
    requestId,
    data: {
      contributorAccount: accountName,
      contributorId: creditedUserId,
      oldAmount: previousTroops,
      newAmount: troops,
    },
  });

  await updateDefCallCard(client, scope, request);
  await refreshHubChannel(client, scope);

  const change = `${formatTroops(previousTroops)} ${ARROW} ${formatTroops(troops)}`;
  const total = `${formatTroops(request.troopsSent)}${request.troopsNeeded ? ` / ${formatTroops(request.troopsNeeded)}` : ""}`;

  return {
    success: true,
    actionId,
    actionText: `<@${userId}> changed **${accountName}** troops on (${request.x}|${request.y}): ${change}`,
    confirmText: `✅ Changed **${accountName}** troops: ${change}. Total now **${total}**.`,
    requestId,
    accountName,
    oldTroops: previousTroops,
    newTroops: troops,
    totalTroops: request.troopsSent,
  };
}
