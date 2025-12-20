import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { removeRequest, getRequestById, DefenseRequest } from "../services/defense-requests";
import { updateGlobalMessage } from "../services/defense-message";
import { getVillageAt } from "../services/map-data";
import { withRetry } from "../utils/retry";
import { recordAction } from "../services/action-history";

export const deletedefCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("deletedef")
    .setDescription("Delete a defense request")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("The defense request ID number")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const requestId = interaction.options.getInteger("id", true);
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

    // Check if request exists and get info before deletion
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

    // Snapshot the request before deletion for undo support
    const snapshot: DefenseRequest = {
      ...existingRequest,
      contributors: existingRequest.contributors.map(c => ({ ...c })),
    };

    // Get village info for confirmation message
    const village = await getVillageAt(config.serverKey, existingRequest.x, existingRequest.y);
    const villageName = village?.villageName || "Nežinomas";
    const playerName = village?.playerName || "Nežinomas";

    // Delete the request
    const success = removeRequest(guildId, requestId);

    if (!success) {
      await interaction.editReply({ content: `Nepavyko ištrinti užklausos #${requestId}.` });
      return;
    }

    // Record the action for undo support
    const actionId = recordAction(guildId, {
      type: "REQUEST_DELETED",
      userId: interaction.user.id,
      coords: { x: snapshot.x, y: snapshot.y },
      previousState: snapshot,
      data: {},
    });

    // Update the global message
    await updateGlobalMessage(interaction.client, guildId);

    await interaction.editReply({
      content: `<@${interaction.user.id}> ištrynė užklausą #${requestId}: **${villageName}** (${existingRequest.x}|${existingRequest.y}) - ${playerName}. (\`/undo ${actionId}\`)`,
    });
  },
};
