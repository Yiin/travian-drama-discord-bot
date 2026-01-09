import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { validateDefenseConfig } from "../actions";
import { getRequestById, getAllRequests } from "../services/defense-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { buildStackEditButtons } from "../services/button-handlers/stack-edit";

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
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Get request ID
  const requestId = interaction.options.getInteger("id", true);

  // 3. Get the request
  const request = getRequestById(validation.guildId, requestId);
  if (!request) {
    await interaction.reply({
      content: `Užklausa #${requestId} nerasta.`,
      ephemeral: true,
    });
    return;
  }

  // 4. Get village info
  const village = validation.config.serverKey
    ? await getVillageAt(validation.config.serverKey, request.x, request.y)
    : null;

  const villageName = village?.villageName || "Nežinomas";
  const playerName = village?.playerName || "Nežinomas";
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
    `**Kaimas:** ${villageName}`,
    `**Žaidėjas:** ${playerName}`,
    `**Kariai:** ${request.troopsSent}/${request.troopsNeeded} (${progress}%)`,
  ];

  if (request.message) {
    lines.push(`**Žinutė:** ${request.message}`);
  }

  // 6. Reply with buttons
  await interaction.reply({
    content: lines.join("\n"),
    components: [buildStackEditButtons(requestId, totalRequests)],
    ephemeral: true,
  });
}
