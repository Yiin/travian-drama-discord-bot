import { addRequest } from "../services/defense-requests";
import {
  getVillageAt,
  ensureMapData,
  formatVillageDisplay,
} from "../services/map-data";
import { recordAction } from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { parseAndValidateCoords } from "./validation";
import { ActionContext, DefActionInput, DefActionResult } from "./types";
import { errors } from "./messages";
import { formatTroops } from "../utils/format";

/**
 * Execute the "stack" action - create a stack defense request.
 *
 * This is the centralized business logic. All interfaces (slash, modal, text)
 * call this function after parsing their inputs.
 */
export async function executeStackAction(
  context: ActionContext,
  input: DefActionInput,
): Promise<DefActionResult> {
  const { guildId, config, client, userId } = context;
  const { coords: coordsInput, troopsNeeded, message } = input;

  // 1. Parse and validate coordinates
  const coordsResult = parseAndValidateCoords(coordsInput);
  if (!coordsResult.success) {
    return { success: false, error: coordsResult.error };
  }
  const { x, y } = coordsResult;

  // 2. Ensure map data is available
  const dataReady = await ensureMapData(config.serverKey!);
  if (!dataReady) {
    return {
      success: false,
      error: errors.mapUnavailable(),
    };
  }

  // 3. Get village info (may be null for new/unknown villages)
  const village = await getVillageAt(config.serverKey!, x, y);

  // 4. Add the request (multiple requests per coordinate allowed)
  const result = addRequest(
    guildId,
    x,
    y,
    troopsNeeded,
    message,
    userId,
  );
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  // 5. Record the action for undo support
  const actionId = recordAction(guildId, {
    type: "DEF_ADD",
    userId,
    coords: { x, y },
    requestId: result.requestId,
    data: {
      troopsNeeded,
      message,
    },
  });

  // 6. Build action text
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${x}|${y}) Unknown/new village`;
  const allianceInfo = village?.allianceName
    ? ` [${village.allianceName}]`
    : "";
  const actionText = `<@${userId}> created request #${result.requestId}: ${villageDisplay}${allianceInfo} - needs ${formatTroops(troopsNeeded)} troops`;
  const confirmText = `✅ Created request #${result.requestId}: ${villageDisplay}${allianceInfo}. Needs **${formatTroops(troopsNeeded)}** troops.`;

  // 7. Update the global message and post the audit line
  await updateGlobalMessage(client, guildId, { text: actionText, undoId: actionId });

  return {
    success: true,
    actionId,
    actionText,
    confirmText,
    requestId: result.requestId,
    villageName: village?.villageName ?? "Unknown/new village",
    playerName: village?.playerName ?? "Unknown",
    allianceName: village?.allianceName,
    coords: { x, y },
  };
}
