import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { getGuildConfig } from "../config/guild-config";
import { addOrUpdateRequest } from "../services/defense-requests";
import { updateGlobalMessage } from "../services/defense-message";
import { getVillageAt, ensureMapData } from "../services/map-data";

export const defCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("def")
    .setDescription("Create or update a defense request")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Coordinates (e.g., 123|456, 123 456, (123|456))")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Number of troops needed")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Additional information about the defense request")
        .setRequired(false) // optional
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const coordsInput = interaction.options.getString("coords", true);
    const troopsNeeded = interaction.options.getInteger("troops", true);
    const message = interaction.options.getString("message") || "";
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content:
          "Travian server not configured. An admin must run `/setserver` first.",
        ephemeral: true,
      });
      return;
    }

    if (!config.defenseChannelId) {
      await interaction.reply({
        content:
          "Defense channel not configured. An admin must run `/setchannel type:Defense` first.",
        ephemeral: true,
      });
      return;
    }

    const coords = parseCoords(coordsInput);
    if (!coords) {
      await interaction.reply({
        content:
          "Invalid coordinates. Please provide two numbers (e.g., 123|456, 123 456).",
        ephemeral: true,
      });
      return;
    }

    // Defer reply as map data lookup may take time
    await interaction.deferReply({ ephemeral: true });

    // Ensure map data is available
    const dataReady = await ensureMapData(config.serverKey);
    if (!dataReady) {
      await interaction.editReply({
        content: "Failed to load map data. Please try again later.",
      });
      return;
    }

    // Validate village exists at coordinates
    const village = await getVillageAt(config.serverKey, coords.x, coords.y);
    if (!village) {
      await interaction.editReply({
        content: `No village found at coordinates (${coords.x}|${coords.y}). Please check the coordinates and try again.`,
      });
      return;
    }

    // Add or update the request
    const result = addOrUpdateRequest(
      guildId,
      coords.x,
      coords.y,
      troopsNeeded,
      message,
      interaction.user.id
    );

    if ("error" in result) {
      await interaction.editReply({ content: result.error });
      return;
    }

    // Update the global message
    await updateGlobalMessage(interaction.client, guildId);

    const actionText = result.isUpdate ? "updated" : "created";
    const playerInfo = village.allianceName
      ? `${village.playerName} [${village.allianceName}]`
      : village.playerName;
    await interaction.editReply({
      content: `Defense request #${result.request.id} ${actionText} for **${village.villageName}** (${coords.x}|${coords.y}) - ${playerInfo} - ${troopsNeeded} troops needed.`,
    });
  },
};
