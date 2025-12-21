import { addOrUpdateRequest } from "../services/defense-requests";
import { getVillageAt, ensureMapData } from "../services/map-data";
import { recordAction } from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { parseAndValidateCoords } from "./validation";
import { ActionContext, DefActionInput, DefActionResult } from "./types";

/**
 * Execute the "def" action - create or update a defense request.
 *
 * This is the centralized business logic. All interfaces (slash, modal, text)
 * call this function after parsing their inputs.
 */
export async function executeDefAction(
  context: ActionContext,
  input: DefActionInput
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
      error: "Nepavyko užkrauti žemėlapio duomenų. Bandyk vėliau.",
    };
  }

  // 3. Validate village exists at coordinates
  const village = await getVillageAt(config.serverKey!, x, y);
  if (!village) {
    return {
      success: false,
      error: `Arba to kaimo nėra arba jis ką tik įkurtas (${x}|${y}).`,
    };
  }

  // 4. Add or update the request
  const result = addOrUpdateRequest(guildId, x, y, troopsNeeded, message, userId);
  if ("error" in result) {
    return { success: false, error: result.error };
  }

  // 5. Record the action for undo support
  const actionId = recordAction(guildId, {
    type: result.isUpdate ? "DEF_UPDATE" : "DEF_ADD",
    userId,
    coords: { x, y },
    previousState: result.previousRequest,
    data: {
      troopsNeeded,
      message,
    },
  });

  // 6. Update the global message
  await updateGlobalMessage(client, guildId);

  // 7. Build action text
  const actionVerb = result.isUpdate ? "atnaujino" : "sukūrė";
  const playerInfo = village.allianceName
    ? `${village.playerName} [${village.allianceName}]`
    : village.playerName;
  const actionText = `<@${userId}> ${actionVerb} užklausą #${result.requestId}: **${village.villageName}** (${x}|${y}) - ${playerInfo} - reikia ${troopsNeeded} karių. (\`/undo ${actionId}\`)`;

  return {
    success: true,
    actionId,
    actionText,
    requestId: result.requestId,
    villageName: village.villageName,
    playerName: village.playerName,
    allianceName: village.allianceName,
    isUpdate: result.isUpdate,
    coords: { x, y },
  };
}
