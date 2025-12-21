import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { updateRequest, getRequestById, DefenseRequest } from "../services/defense-requests";
import { updateGlobalMessage } from "../services/defense-message";
import { withRetry } from "../utils/retry";
import { recordAction } from "../services/action-history";

export const updatedefCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("updatedef")
    .setDescription("Update a defense request")
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
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const requestId = interaction.options.getInteger("id", true);
    const troopsSent = interaction.options.getInteger("troops_sent");
    const troopsNeeded = interaction.options.getInteger("troops_needed");
    const message = interaction.options.getString("message");
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

    // Check if at least one update parameter is provided
    if (troopsSent === null && troopsNeeded === null && message === null) {
      await interaction.reply({
        content: "Nurodyk bent vieną lauką atnaujinti (troops_sent, troops_needed arba message).",
        ephemeral: true,
      });
      return;
    }

    // Check if request exists
    const existingRequest = getRequestById(guildId, requestId);
    if (!existingRequest) {
      await interaction.reply({
        content: `Užklausa #${requestId} nerasta.`,
        ephemeral: true,
      });
      return;
    }

    // Defer reply as updating may take time
    await withRetry(() => interaction.deferReply());

    // Snapshot the request before update for undo support
    const snapshot: DefenseRequest = {
      ...existingRequest,
      contributors: existingRequest.contributors.map(c => ({ ...c })),
    };

    // Build update object
    const updates: { troopsSent?: number; troopsNeeded?: number; message?: string } = {};
    if (troopsSent !== null) updates.troopsSent = troopsSent;
    if (troopsNeeded !== null) updates.troopsNeeded = troopsNeeded;
    if (message !== null) updates.message = message;

    // Calculate if this update will complete the request
    const newTroopsSent = troopsSent !== null ? troopsSent : existingRequest.troopsSent;
    const newTroopsNeeded = troopsNeeded !== null ? troopsNeeded : existingRequest.troopsNeeded;
    const willComplete = newTroopsSent >= newTroopsNeeded;

    // Update the request
    const result = updateRequest(guildId, requestId, updates);

    if ("error" in result) {
      await interaction.editReply({ content: result.error });
      return;
    }

    // Record the action for undo support
    const actionId = recordAction(guildId, {
      type: "ADMIN_UPDATE",
      userId: interaction.user.id,
      coords: { x: snapshot.x, y: snapshot.y },
      previousState: snapshot,
      data: {
        previousTroopsSent: snapshot.troopsSent,
        previousTroopsNeeded: snapshot.troopsNeeded,
        previousMessage: snapshot.message,
        adminDidComplete: willComplete,
      },
    });

    // Update the global message
    await updateGlobalMessage(interaction.client, guildId);

    const updatedFields: string[] = [];
    if (troopsSent !== null) updatedFields.push(`išsiųsta karių: ${troopsSent}`);
    if (troopsNeeded !== null) updatedFields.push(`reikia karių: ${troopsNeeded}`);
    if (message !== null) updatedFields.push(`žinutė: "${message}"`);

    await interaction.editReply({
      content: `<@${interaction.user.id}> atnaujino užklausą #${requestId}: ${updatedFields.join(", ")}. (\`/undo ${actionId}\`)`,
    });
  },
};
