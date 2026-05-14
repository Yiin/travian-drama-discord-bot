import {
  undoAction as performUndo,
  getAction,
  getActionDescription,
  isPushAction,
  isDefCallAction,
} from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { updatePushChannelEmbed } from "../services/push-message";
import { getPushRequestById } from "../services/push-requests";
import { getRequestById as getDefCallRequestById } from "../services/def-calls";
import {
  refreshHubChannel,
  updateDefCallChannelEmbed,
} from "../services/def-calls-message";
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
    if (result.requestId) {
      const request = getDefCallRequestById(guildId, result.requestId);
      if (request && request.channelId) {
        await updateDefCallChannelEmbed(client, guildId, request);
      }
    }
    await refreshHubChannel(client, guildId);
  } else if (isPushAction(action)) {
    // For push actions, try to update the channel embed if the request still exists
    // Note: For deleted requests that were restored, the channel won't be recreated
    if (result.requestId) {
      const request = getPushRequestById(guildId, result.requestId);
      if (request && request.channelId) {
        await updatePushChannelEmbed(client, guildId, request);
      }
    }
    // For PUSH_REQUEST_ADD undo (deletion), the channel should be deleted
    if (action.type === "PUSH_REQUEST_ADD" && action.data.channelId) {
      // Channel was already deleted as part of the undo, nothing more to do
    }
  } else {
    await updateGlobalMessage(client, guildId);
  }

  // 5. Get description of what was undone
  const description = getActionDescription(action);

  // 6. Build action text
  const actionText = `<@${userId}> undid action #${actionId}: ${description}`;

  return {
    success: true,
    actionId, // Using the same actionId for reference
    actionText,
    description,
  };
}
