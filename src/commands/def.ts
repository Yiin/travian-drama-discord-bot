import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { getGuildConfig } from "../config/guild-config";
import { addOrUpdateRequest } from "../services/defense-requests";
import { updateGlobalMessage } from "../services/defense-message";

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

    // Defer reply as updating global message may take time
    await interaction.deferReply({ ephemeral: true });

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
    await interaction.editReply({
      content: `Defense request #${result.request.id} ${actionText} for (${coords.x}|${coords.y}) - ${troopsNeeded} troops needed.`,
    });
  },
};
