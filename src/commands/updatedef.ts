import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { updateRequest, getRequestById } from "../services/defense-requests";
import { updateGlobalMessage } from "../services/defense-message";

export const updatedefCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("updatedef")
    .setDescription("Update a defense request (Admin only)")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("The defense request ID number")
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops_sent")
        .setDescription("Set the troops sent count")
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops_needed")
        .setDescription("Set the troops needed count")
        .setRequired(false)
        .setMinValue(1)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Update the request message")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const requestId = interaction.options.getInteger("id", true);
    const troopsSent = interaction.options.getInteger("troops_sent");
    const troopsNeeded = interaction.options.getInteger("troops_needed");
    const message = interaction.options.getString("message");
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
        content: "Defense channel not configured.",
        ephemeral: true,
      });
      return;
    }

    // Check if at least one update parameter is provided
    if (troopsSent === null && troopsNeeded === null && message === null) {
      await interaction.reply({
        content: "Please provide at least one field to update (troops_sent, troops_needed, or message).",
        ephemeral: true,
      });
      return;
    }

    // Check if request exists
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

    // Build update object
    const updates: { troopsSent?: number; troopsNeeded?: number; message?: string } = {};
    if (troopsSent !== null) updates.troopsSent = troopsSent;
    if (troopsNeeded !== null) updates.troopsNeeded = troopsNeeded;
    if (message !== null) updates.message = message;

    // Update the request
    const result = updateRequest(guildId, requestId, updates);

    if ("error" in result) {
      await interaction.editReply({ content: result.error });
      return;
    }

    // Update the global message
    await updateGlobalMessage(interaction.client, guildId);

    const updatedFields: string[] = [];
    if (troopsSent !== null) updatedFields.push(`troops sent: ${troopsSent}`);
    if (troopsNeeded !== null) updatedFields.push(`troops needed: ${troopsNeeded}`);
    if (message !== null) updatedFields.push(`message: "${message}"`);

    await interaction.editReply({
      content: `Request #${requestId} updated: ${updatedFields.join(", ")}`,
    });
  },
};
