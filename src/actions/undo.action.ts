import {
  undoAction as performUndo,
  getAction,
  getActionDescription,
  isPushAction,
  isDefCallAction,
} from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { updatePushCard, archivePushThread, unarchivePushThread } from "../services/push-message";
import { getPushRequestById } from "../services/push-requests";
import { getRequestById as getDefCallRequestById } from "../services/def-calls";
import {
  refreshHubChannel,
  updateDefCallCard,
  archiveDefCallThread,
  unarchiveDefCallThread,
} from "../services/def-calls-message";
import { scheduleLanding, cancelLanding } from "../services/landing-scheduler";
import { removeContribution } from "../services/stats";
import { removePushContribution } from "../services/push-stats";
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
    return { success: false, error: `Action #${actionId} was not found.` };
  }

  // 2. Perform the undo
  const result = performUndo(guildId, actionId);
  if (!result.success) {
    return { success: false, error: result.message };
  }

  // 3. Reverse stats contribution if this was a TROOPS_SENT action
  if (action.type === "TROOPS_SENT" && action.data.troops && action.data.contributorId) {
    removeContribution(
      guildId,
      action.data.contributorId,
      action.coords.x,
      action.coords.y,
      action.data.troops
    );
  }

  // 3b. Reverse push stats contribution if this was a PUSH_RESOURCES_SENT action
  if (action.type === "PUSH_RESOURCES_SENT" && action.data.resources && action.data.contributorAccount) {
    removePushContribution(
      guildId,
      action.data.contributorAccount,
      action.coords.x,
      action.coords.y,
      action.data.resources
    );
  }

  // 3c. Reverse stats contribution if this was a DEF_CALL_TROOPS_SENT action
  if (action.type === "DEF_CALL_TROOPS_SENT" && action.data.troops) {
    removeContribution(
      guildId,
      action.userId,
      action.coords.x,
      action.coords.y,
      action.data.troops
    );
  }

  // 4. Update the appropriate message/channel based on action type
  if (isDefCallAction(action)) {
    const request = getDefCallRequestById(guildId, result.requestId ?? action.requestId);
    if (request && request.channelId) {
      if (request.closed) {
        cancelLanding(guildId, request.id);
        await updateDefCallCard(client, guildId, request);
        await archiveDefCallThread(client, request);
      } else {
        await unarchiveDefCallThread(client, request);
        await updateDefCallCard(client, guildId, request);
        scheduleLanding(client, guildId, request);
      }
    }
    await refreshHubChannel(client, guildId);
  } else if (isPushAction(action)) {
    const request = getPushRequestById(guildId, result.requestId ?? action.requestId);
    if (request && request.channelId) {
      if (request.closed) {
        await updatePushCard(client, guildId, request);
        await archivePushThread(client, request);
      } else {
        await unarchivePushThread(client, request);
        await updatePushCard(client, guildId, request);
      }
    }
  } else {
    await updateGlobalMessage(client, guildId);
  }

  // 5. Get description of what was undone
  const description = getActionDescription(action);

  // 6. Build action text
  const actionText = `<@${userId}> undid action #${actionId}: ${description}`;
  const detail = result.message.replace(/^Undone:\s*/i, "");
  const confirmText = `✅ Undone #${actionId}: ${description}. ${detail}`;

  return {
    success: true,
    actionId, // Using the same actionId for reference
    actionText,
    confirmText,
    description,
  };
}
