import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { undoAction, getAction, getActionDescription } from "../services/action-history";
import { updateGlobalMessage } from "../services/defense-message";
import { withRetry } from "../utils/retry";

export const undoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("undo")
    .setDescription("Undo a previous action")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("The action ID to undo (shown after each command)")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const actionId = interaction.options.getInteger("id", true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "Ši komanda veikia tik serveryje.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.defenseChannelId) {
      await interaction.reply({
        content: "Gynybos kanalas nesukonfigūruotas. Adminas turi paleisti `/setchannel type:Defense`.",
        ephemeral: true,
      });
      return;
    }

    // Get the action to show what we're undoing
    const action = getAction(guildId, actionId);
    if (!action) {
      await interaction.reply({
        content: `Veiksmas #${actionId} nerastas.`,
        ephemeral: true,
      });
      return;
    }

    // Defer reply as this may take time
    await withRetry(() => interaction.deferReply());

    // Perform the undo
    const result = undoAction(guildId, actionId);

    if (!result.success) {
      await interaction.editReply({ content: result.message });
      return;
    }

    // Update the global message
    await updateGlobalMessage(interaction.client, guildId);

    // Include description of what was undone
    const description = getActionDescription(action);
    await interaction.editReply({
      content: `<@${interaction.user.id}> atšaukė veiksmą #${actionId}: ${description}`,
    });
  },
};
