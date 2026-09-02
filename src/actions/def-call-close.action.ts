import {
  closeRequest,
  getRequestById,
  DefCallRequest,
} from "../services/def-calls";
import {
  archiveDefCallThread,
  updateDefCallCard,
  refreshHubChannel,
} from "../services/def-calls-message";
import { cancelLanding } from "../services/landing-scheduler";
import { recordAction } from "../services/action-history";
import {
  ActionContext,
  DefCallCloseActionInput,
  DefCallCloseActionResult,
  DefCallCloseActionSuccess,
} from "./types";

export interface CloseOptions {
  isAdmin: boolean;
  /**
   * Runs after the state changed and before the thread is archived. Callers use
   * it to send their reply: Discord rejects interaction edits and reactions in
   * an archived thread.
   */
  onClosed?: (result: DefCallCloseActionSuccess) => Promise<void>;
}

export async function executeDefCallCloseAction(
  context: ActionContext,
  input: DefCallCloseActionInput,
  options: CloseOptions
): Promise<DefCallCloseActionResult> {
  const { guildId, client, userId } = context;
  const { requestId } = input;

  const request = getRequestById(guildId, requestId);
  if (!request) {
    return { success: false, error: `Request #${requestId} not found.` };
  }

  if (request.requesterId !== userId && !options.isAdmin) {
    return {
      success: false,
      error: "Only the player who created the request or an administrator can close it.",
    };
  }

  const previousState: DefCallRequest = {
    ...request,
    contributors: [...request.contributors],
  };

  const closed = closeRequest(guildId, requestId);
  if ("error" in closed) {
    return { success: false, error: closed.error };
  }

  cancelLanding(guildId, requestId);
  await updateDefCallCard(client, guildId, closed);

  const actionId = recordAction(guildId, {
    type: "DEF_CALL_CLOSED",
    userId,
    coords: { x: request.x, y: request.y },
    requestId,
    previousDefCallState: previousState,
    data: {
      channelId: request.channelId,
    },
  });

  const result: DefCallCloseActionSuccess = {
    success: true,
    actionId,
    actionText: `Request (${request.x}|${request.y}) closed.`,
    confirmText: "✅ Request closed. The thread is archived; undo reopens it.",
    requestId,
    coords: { x: request.x, y: request.y },
  };

  if (options.onClosed) {
    try {
      await options.onClosed(result);
    } catch (error) {
      console.error("[DefCallClose] Reply before archive failed:", error);
    }
  }
  await archiveDefCallThread(client, closed);
  await refreshHubChannel(client, guildId);

  return result;
}
