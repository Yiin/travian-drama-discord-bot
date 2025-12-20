import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { reportTroopsSent, getRequestById, getRequestByCoords, DefenseRequest } from "../services/defense-requests";
import { parseCoords } from "../utils/parse-coords";
import {
  updateGlobalMessage,
  sendTroopNotification,
} from "../services/defense-message";
import { getVillageAt } from "../services/map-data";
import { withRetry } from "../utils/retry";
import { recordAction } from "../services/action-history";

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
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to credit for sending troops (defaults to you)")
        .setRequired(false)
    );
}

async function executeSent(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetInput = interaction.options.getString("target", true);
    const troops = interaction.options.getInteger("troops", true);
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "Ši komanda veikia tik serveryje.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content: "Travian serveris nesukonfigūruotas. Adminas turi paleisti `/setserver`.",
        ephemeral: true,
      });
      return;
    }

    if (!config.defenseChannelId) {
      await interaction.reply({
        content: "Gynybos kanalas nesukonfigūruotas. Adminas turi paleisti `/setchannel type:Defense`.",
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
          content: `Nerasta aktyvi užklausa koordinatėse (${coords.x}|${coords.y}).`,
          ephemeral: true,
        });
        return;
      }
      requestId = found.requestId;
    } else {
      const parsed = parseInt(targetInput, 10);
      if (isNaN(parsed) || parsed < 1) {
        await interaction.reply({
          content: "Neteisingas įvedimas. Nurodyk užklausos ID (pvz., 1) arba koordinates (pvz., 123|456).",
          ephemeral: true,
        });
        return;
      }
      requestId = parsed;
      const existingRequest = getRequestById(guildId, requestId);
      if (!existingRequest) {
        await interaction.reply({
          content: `Užklausa #${requestId} nerasta.`,
          ephemeral: true,
        });
        return;
      }
    }

    // Defer reply as updating may take time (with retry for transient errors)
    await withRetry(() => interaction.deferReply());

    // Snapshot the request before modification for undo support
    const requestBefore = getRequestById(guildId, requestId);
    if (!requestBefore) {
      await interaction.editReply({ content: `Užklausa #${requestId} nerasta.` });
      return;
    }
    const snapshot: DefenseRequest = {
      ...requestBefore,
      contributors: requestBefore.contributors.map(c => ({ ...c })),
    };

    // Report the troops sent
    const result = reportTroopsSent(
      guildId,
      requestId,
      targetUser.id,
      troops
    );

    if ("error" in result) {
      await interaction.editReply({ content: result.error });
      return;
    }

    // Record the action for undo support
    const actionId = recordAction(guildId, {
      type: "TROOPS_SENT",
      userId: interaction.user.id,
      coords: { x: snapshot.x, y: snapshot.y },
      previousState: snapshot,
      data: {
        troops,
        contributorId: targetUser.id,
        didComplete: result.isComplete,
      },
    });

    // Send notification to the defense channel
    await sendTroopNotification(
      interaction.client,
      guildId,
      targetUser.id,
      troops,
      result.request,
      result.isComplete,
      requestId
    );

    // Update the global message
    await updateGlobalMessage(interaction.client, guildId);

    // Get village info for detailed message
    const village = await getVillageAt(config.serverKey, result.request.x, result.request.y);
    const villageName = village?.villageName || "Nežinomas";
    const playerName = village?.playerName || "Nežinomas";

    const creditUser = targetUser.id !== interaction.user.id ? `<@${targetUser.id}>` : `<@${interaction.user.id}>`;
    let replyMessage: string;
    if (result.isComplete) {
      replyMessage = `${creditUser} užbaigė užklausą #${requestId}: **${villageName}** (${result.request.x}|${result.request.y}) - ${playerName} - **${result.request.troopsSent}/${result.request.troopsNeeded}** karių. (\`/undo ${actionId}\`)`;
    } else {
      replyMessage = `${creditUser} išsiuntė ${troops} karių į **${villageName}** (${result.request.x}|${result.request.y}) - ${playerName} - Progresas: **${result.request.troopsSent}/${result.request.troopsNeeded}** (\`/undo ${actionId}\`)`;
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
