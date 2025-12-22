import {
  removeRequest,
  getRequestById,
  DefenseRequest,
} from "../services/defense-requests";
import { getVillageAt, getMapLink, formatVillageDisplay } from "../services/map-data";
import { recordAction } from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { ActionContext, DeleteDefActionInput, DeleteDefActionResult } from "./types";

/**
 * Execute the "deletedef" action - delete a defense request.
 *
 * This is the centralized business logic. All interfaces (slash, text)
 * call this function after parsing their inputs.
 */
export async function executeDeleteDefAction(
  context: ActionContext,
  input: DeleteDefActionInput
): Promise<DeleteDefActionResult> {
  const { guildId, config, client, userId } = context;
  const { requestId } = input;

  // 1. Check if request exists and get info before deletion
  const existingRequest = getRequestById(guildId, requestId);
  if (!existingRequest) {
    return { success: false, error: `Užklausa #${requestId} nerasta.` };
  }

  // 2. Snapshot the request before deletion for undo support
  const snapshot: DefenseRequest = {
    ...existingRequest,
    contributors: existingRequest.contributors.map((c) => ({ ...c })),
  };

  // 3. Get village info for confirmation message
  const village = await getVillageAt(
    config.serverKey!,
    existingRequest.x,
    existingRequest.y
  );
  const villageName = village?.villageName || "Nežinomas";
  const playerName = village?.playerName || "Nežinomas";
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `[(${existingRequest.x}|${existingRequest.y})](${getMapLink(config.serverKey!, existingRequest)})`;

  // 4. Delete the request
  const success = removeRequest(guildId, requestId);
  if (!success) {
    return { success: false, error: `Nepavyko ištrinti užklausos #${requestId}.` };
  }

  // 5. Record the action for undo support
  const actionId = recordAction(guildId, {
    type: "REQUEST_DELETED",
    userId,
    coords: { x: snapshot.x, y: snapshot.y },
    previousState: snapshot,
    data: {},
  });

  // 6. Update the global message
  await updateGlobalMessage(client, guildId);

  // 7. Build action text
  const actionText = `<@${userId}> ištrynė užklausą #${requestId}: ${villageDisplay}. (\`/undo ${actionId}\`)`;

  return {
    success: true,
    actionId,
    actionText,
    requestId,
    villageName,
    playerName,
    coords: { x: existingRequest.x, y: existingRequest.y },
  };
}
