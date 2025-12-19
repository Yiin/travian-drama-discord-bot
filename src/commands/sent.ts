import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { reportTroopsSent, getRequestById, getRequestByCoords } from "../services/defense-requests";
import { parseCoords } from "../utils/parse-coords";
import {
  updateGlobalMessage,
  sendTroopNotification,
} from "../services/defense-message";
import { getVillageAt } from "../services/map-data";
import { withRetry } from "../utils/retry";

function buildSentCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Report troops sent to a defense request")
    .addStringOption((option) =>
      option
        .setName("target")
        .setDescription("Request ID or coordinates (e.g., 1 or 123|456)")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Number of troops sent")
        .setRequired(true)
        .setMinValue(1)
    );
}

async function executeSent(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetInput = interaction.options.getString("target", true);
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

    // Try to parse as coordinates first, then as ID
    let requestId: number;
    const coords = parseCoords(targetInput);
    if (coords) {
      const found = getRequestByCoords(guildId, coords.x, coords.y);
      if (!found) {
        await interaction.reply({
          content: `No active request found at (${coords.x}|${coords.y}).`,
          ephemeral: true,
        });
        return;
      }
      requestId = found.requestId;
    } else {
      const parsed = parseInt(targetInput, 10);
      if (isNaN(parsed) || parsed < 1) {
        await interaction.reply({
          content: "Invalid input. Provide a request ID (e.g., 1) or coordinates (e.g., 123|456).",
          ephemeral: true,
        });
        return;
      }
      requestId = parsed;
      const existingRequest = getRequestById(guildId, requestId);
      if (!existingRequest) {
        await interaction.reply({
          content: `Request #${requestId} not found.`,
          ephemeral: true,
        });
        return;
      }
    }

    // Defer reply as updating may take time (with retry for transient errors)
    await withRetry(() => interaction.deferReply({ ephemeral: true }));

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
      result.isComplete,
      requestId
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
}

export const sentCommand: Command = {
  data: buildSentCommand("sent"),
  execute: executeSent,
};

export const stackCommand: Command = {
  data: buildSentCommand("stack"),
  execute: executeSent,
};
