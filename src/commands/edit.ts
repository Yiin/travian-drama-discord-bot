import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { Command } from "../types";
import { validateDefenseConfig } from "../actions";
import { getRequestById, getAllRequests } from "../services/defense-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { buildStackEditButtons } from "../services/button-handlers/stack-edit";
import { formatTroops } from "../utils/format";

export const editCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("edit")
    .setDescription("Edit defense requests")
    .addSubcommand((sub) =>
      sub
        .setName("stack")
        .setDescription("Edit a defense request with interactive buttons")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("The defense request ID number")
            .setRequired(true)
            .setMinValue(1)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "stack") {
      await handleStackEdit(interaction);
    }
  },
};

async function handleStackEdit(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    return;
  }

  // 2. Get request ID
  const requestId = interaction.options.getInteger("id", true);

  // 3. Get the request
  const request = getRequestById(validation.guildId, requestId);
  if (!request) {
    await interaction.reply({
      content: `Request #${requestId} not found.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 4. Get village info
  const village = validation.config.serverKey
    ? await getVillageAt(validation.config.serverKey, request.x, request.y)
    : null;

  const villageName = village?.villageName || "Unknown";
  const playerName = village?.playerName || "Unknown";
  const villageDisplay = village && validation.config.serverKey
    ? formatVillageDisplay(validation.config.serverKey, village)
    : `(${request.x}|${request.y})`;

  // 5. Build content
  const totalRequests = getAllRequests(validation.guildId).length;
  const progress = request.troopsNeeded > 0
    ? Math.round((request.troopsSent / request.troopsNeeded) * 100)
    : 0;

  const lines = [
    `**#${requestId}/${totalRequests}** ${villageDisplay}`,
    `**Village:** ${villageName}`,
    `**Player:** ${playerName}`,
    `**Troops:** ${formatTroops(request.troopsSent)} / ${formatTroops(request.troopsNeeded)} (${progress}%)`,
  ];

  if (request.message) {
    lines.push(`**Message:** ${request.message}`);
  }

  // 6. Reply with buttons
  await interaction.reply({
    content: lines.join("\n"),
    components: [buildStackEditButtons(requestId, totalRequests)],
    flags: MessageFlags.Ephemeral,
  });
}
