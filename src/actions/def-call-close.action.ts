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
} from "./types";

export async function executeDefCallCloseAction(
  context: ActionContext,
  input: DefCallCloseActionInput,
  options: { isAdmin: boolean }
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
  await archiveDefCallThread(client, closed);
  await refreshHubChannel(client, guildId);

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

  const actionText = `Request (${request.x}|${request.y}) closed.`;
  const confirmText = "✅ Request closed. The thread is archived; undo reopens it.";

  return {
    success: true,
    actionId,
    actionText,
    confirmText,
    requestId,
    coords: { x: request.x, y: request.y },
  };
}
