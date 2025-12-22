import {
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  Client,
} from "discord.js";
import {
  getVillageAt,
  ensureMapData,
  getRallyPointLink,
  formatVillageDisplay,
} from "../services/map-data";
import { parseAndValidateCoords } from "./validation";
import { ActionContext, ScoutActionInput, ScoutActionResult, ActionError } from "./types";
import { SCOUT_GOING_BUTTON_ID } from "../services/button-handlers";

/**
 * Execute the "scout" action - validate coordinates and get village info.
 *
 * This is the centralized business logic. All interfaces (slash, text)
 * call this function after parsing their inputs.
 */
export async function executeScoutAction(
  context: ActionContext,
  input: ScoutActionInput
): Promise<ScoutActionResult> {
  const { config } = context;
  const { coords: coordsInput } = input;

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
      error: `Kaimas koordinatėse (${x}|${y}) nerastas. Patikrink koordinates ir bandyk dar kartą.`,
    };
  }

  // 4. Get rally link and formatted display
  const rallyLink = getRallyPointLink(config.serverKey!, village.targetMapId, 3);
  const villageDisplay = formatVillageDisplay(config.serverKey!, village);

  return {
    success: true,
    villageName: village.villageName,
    playerName: village.playerName,
    population: village.population,
    rallyLink,
    villageDisplay,
    coords: { x, y },
  };
}

/**
 * Build and send the scout message to the scout channel.
 * Returns true if successful, false otherwise.
 */
export async function sendScoutMessage(
  client: Client,
  scoutChannelId: string,
  data: ScoutActionSuccess & { message: string; requesterName: string; scoutRoleId?: string }
): Promise<boolean> {
  const channel = (await client.channels.fetch(scoutChannelId)) as TextChannel | null;
  if (!channel) {
    return false;
  }

  // Build Components v2 message
  const container = new ContainerBuilder().setAccentColor(0x3498db); // Blue accent

  const roleMention = data.scoutRoleId ? `<@&${data.scoutRoleId}>` : "";
  const content = new TextDisplayBuilder().setContent(
    `## ${data.villageDisplay} · ${data.population} pop\n` +
      `# ${data.message}\n` +
      `## [**SIŲSTI**](${data.rallyLink})\n` +
      (roleMention ? `${roleMention}\n` : "") +
      `> -# Paprašė ${data.requesterName}`
  );

  container.addTextDisplayComponents(content);

  // Add "Eina" button
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SCOUT_GOING_BUTTON_ID)
      .setLabel("Eina")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    components: [container, buttonRow],
    flags: MessageFlags.IsComponentsV2,
  });

  return true;
}

// Re-export the success type for use in sendScoutMessage
type ScoutActionSuccess = Exclude<ScoutActionResult, ActionError>;
