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
import { SCOUT_GOING_BUTTON_ID, SCOUT_DONE_BUTTON_ID } from "../services/button-handlers/index";

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

  // 3. Get village info (may be null for new/unknown villages)
  const village = await getVillageAt(config.serverKey!, x, y);

  // 4. Get rally link and formatted display
  // For unknown villages, we can't generate a rally link (no targetMapId)
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey!, village)
    : `(${x}|${y}) Unknown/new village`;

  return {
    success: true,
    villageName: village?.villageName ?? "Unknown/new village",
    playerName: village?.playerName ?? "Unknown",
    population: village?.population ?? 0,
    rallyLink: village ? getRallyPointLink(config.serverKey!, village.targetMapId, 3) : undefined,
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
  data: ScoutActionSuccess & { message: string; requesterId: string; scoutRoleId?: string }
): Promise<boolean> {
  const channel = (await client.channels.fetch(scoutChannelId)) as TextChannel | null;
  if (!channel) {
    return false;
  }

  // Build Components v2 message with orange accent (pending state)
  const container = new ContainerBuilder().setAccentColor(0xf39c12);

  const roleMention = data.scoutRoleId ? `<@&${data.scoutRoleId}>` : "";
  const sendLink = data.rallyLink
    ? `## [**SIŲSTI**](${data.rallyLink})\n`
    : "";
  const content = new TextDisplayBuilder().setContent(
    `## ${data.villageDisplay} · ${data.population} pop\n` +
      `# ${data.message}\n` +
      sendLink +
      (roleMention ? `${roleMention}\n` : "") +
      `> -# Paprašė <@${data.requesterId}>`
  );

  container.addTextDisplayComponents(content);

  // Add "Eina" and "Atlikta" buttons
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SCOUT_GOING_BUTTON_ID)
      .setLabel("Eina")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(SCOUT_DONE_BUTTON_ID)
      .setLabel("Atlikta")
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({
    components: [container, buttonRow],
    flags: MessageFlags.IsComponentsV2,
  });

  return true;
}

// Re-export the success type for use in sendScoutMessage
type ScoutActionSuccess = Exclude<ScoutActionResult, ActionError>;
