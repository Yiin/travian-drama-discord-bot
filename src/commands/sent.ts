import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { reportTroopsSent, getRequestById } from "../services/defense-requests";
import {
  updateGlobalMessage,
  sendTroopNotification,
} from "../services/defense-message";
import { getVillageAt } from "../services/map-data";

export const sentCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("sent")
    .setDescription("Report troops sent to a defense request")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("The defense request ID number")
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Number of troops sent")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const requestId = interaction.options.getInteger("id", true);
    const troops = interaction.options.getInteger("troops", true);
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
        content: "Travian server not configured. An admin must run `/setserver` first.",
        ephemeral: true,
      });
      return;
    }

    if (!config.defenseChannelId) {
      await interaction.reply({
        content: "Defense channel not configured. An admin must run `/setchannel type:Defense` first.",
        ephemeral: true,
      });
      return;
    }

    // Check if request exists before processing
    const existingRequest = getRequestById(guildId, requestId);
    if (!existingRequest) {
      await interaction.reply({
        content: `Request #${requestId} not found.`,
        ephemeral: true,
      });
      return;
    }

    // Defer reply as updating may take time
    await interaction.deferReply({ ephemeral: true });

    // Report the troops sent
    const result = reportTroopsSent(
      guildId,
      requestId,
      interaction.user.id,
      troops
    );

    if ("error" in result) {
      await interaction.editReply({ content: result.error });
      return;
    }

    // Send notification to the defense channel
    await sendTroopNotification(
      interaction.client,
      guildId,
      interaction.user.id,
      troops,
      result.request,
      result.isComplete
    );

    // Update the global message
    await updateGlobalMessage(interaction.client, guildId);

    // Get village info for detailed message
    const village = await getVillageAt(config.serverKey, result.request.x, result.request.y);
    const villageName = village?.villageName || "Unknown";
    const playerName = village?.playerName || "Unknown";

    let replyMessage: string;
    if (result.isComplete) {
      replyMessage = `Request #${requestId} complete! **${villageName}** (${result.request.x}|${result.request.y}) - ${playerName} - **${result.request.troopsSent}/${result.request.troopsNeeded}** troops sent.`;
    } else {
      replyMessage = `Recorded ${troops} troops to **${villageName}** (${result.request.x}|${result.request.y}) - ${playerName} - Progress: **${result.request.troopsSent}/${result.request.troopsNeeded}**`;
    }

    await interaction.editReply({ content: replyMessage });
  },
};
