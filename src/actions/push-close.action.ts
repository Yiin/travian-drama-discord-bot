import { getPushRequestById, setPushRequestClosed, PushRequest } from "../services/push-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { archivePushThread, updatePushCard } from "../services/push-message";
import { recordAction } from "../services/action-history";
import { ActionContext, PushCloseActionInput, PushCloseActionResult, PushCloseActionSuccess } from "./types";
import { errors } from "./messages";

/** Close a push request: the thread is archived, the data stays, undo reopens it. */
export interface PushCloseOptions {
  isAdmin: boolean;
  /** Runs before the thread is archived, so callers can still reply inside it. */
  onClosed?: (result: PushCloseActionSuccess) => Promise<void>;
}

export async function executePushCloseAction(
  context: ActionContext,
  input: PushCloseActionInput,
  options: PushCloseOptions
): Promise<PushCloseActionResult> {
  const { guildId, config, client, userId } = context;
  const { requestId } = input;

  const request = getPushRequestById(guildId, requestId);
  if (!request) {
    return { success: false, error: errors.notFound("push request", requestId) };
  }
  if (request.closed) {
    return { success: false, error: "⚠️ **This push request is already closed.**" };
  }
  if (request.requesterId !== userId && !options.isAdmin) {
    return {
      success: false,
      error: "⚠️ **Only the requester or an admin can close this push.**",
    };
  }

  const previousState: PushRequest = { ...request, contributors: [...request.contributors] };
  const closed = setPushRequestClosed(guildId, requestId, true);
  if (!closed) {
    return { success: false, error: errors.notFound("push request", requestId) };
  }

  await updatePushCard(client, guildId, closed);

  const actionId = recordAction(guildId, {
    type: "PUSH_REQUEST_CLOSED",
    userId,
    coords: { x: request.x, y: request.y },
    requestId,
    previousPushState: previousState,
    data: { channelId: request.channelId },
  });

  const village = config.serverKey ? await getVillageAt(config.serverKey, request.x, request.y) : null;
  const villageDisplay = village && config.serverKey
    ? formatVillageDisplay(config.serverKey, village)
    : `(${request.x}|${request.y})`;

  const result: PushCloseActionSuccess = {
    success: true,
    actionId,
    actionText: `<@${userId}> closed push request #${requestId}: ${villageDisplay}`,
    confirmText: "✅ Push closed. The thread is archived; undo reopens it.",
    requestId,
    coords: { x: request.x, y: request.y },
  };

  if (options.onClosed) {
    try {
      await options.onClosed(result);
    } catch (error) {
      console.error("[PushClose] Reply before archive failed:", error);
    }
  }
  await archivePushThread(client, closed);

  return result;
}
