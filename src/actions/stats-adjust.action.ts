import { recordContribution } from "../services/stats";
import { recordAction } from "../services/action-history";
import { parseAndValidateCoords } from "./validation";
import { formatTroops } from "../utils/format";
import { errors } from "./messages";
import { ActionContext, ActionError, ActionSuccess } from "./types";

export interface StatsAdjustActionInput {
  coords: string;
  /** Signed troop count: negative subtracts. */
  troops: number;
  /** Discord user whose stats change; defaults to the actor. */
  forUserId?: string;
}

export interface StatsAdjustActionSuccess extends ActionSuccess {
  coords: { x: number; y: number };
  troops: number;
  userId: string;
}

export type StatsAdjustActionResult = StatsAdjustActionSuccess | ActionError;

/**
 * Manual stats adjustment (`/stats add`, `!stats add`). Recorded so an undo
 * or an edited text command can reverse it.
 */
export async function executeStatsAdjustAction(
  context: ActionContext,
  input: StatsAdjustActionInput
): Promise<StatsAdjustActionResult> {
  const { guildId, userId } = context;
  const coordsResult = parseAndValidateCoords(input.coords);
  if (!coordsResult.success) {
    return { success: false, error: coordsResult.error };
  }
  if (input.troops === 0) {
    return { success: false, error: errors.countIsZero("troop") };
  }
  const { x, y } = coordsResult;
  const targetUserId = input.forUserId || userId;

  recordContribution(guildId, targetUserId, x, y, input.troops);

  const actionId = recordAction(guildId, {
    type: "STATS_ADJUST",
    userId,
    coords: { x, y },
    requestId: 0,
    data: { troops: input.troops, contributorId: targetUserId },
  });

  const verb = input.troops > 0 ? "Added" : "Subtracted";
  const preposition = input.troops > 0 ? "to" : "from";
  const amount = formatTroops(Math.abs(input.troops));
  return {
    success: true,
    actionId,
    actionText: `<@${userId}> ${verb.toLowerCase()} ${amount} troops ${preposition} (${x}|${y}) stats for <@${targetUserId}>`,
    confirmText: `✅ ${verb} **${amount}** troops ${preposition} (${x}|${y}) stats for <@${targetUserId}>.`,
    coords: { x, y },
    troops: input.troops,
    userId: targetUserId,
  };
}
