import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { executeUndoAction } from "../actions";
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
    const guildId = interaction.guildId;

    // 1. Basic validation (undo only needs defenseChannelId)
    if (!guildId) {
      await interaction.reply({
        content: "Ši komanda veikia tik serveryje.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.defenseChannelId && !config.pushChannelId) {
      await interaction.reply({
        content: "Nei gynybos, nei push kanalas nesukonfigūruotas. Adminas turi panaudoti `/setchannel`.",
        ephemeral: true,
      });
      return;
    }

    // 2. Parse inputs
    const actionId = interaction.options.getInteger("id", true);

    // 3. Defer reply
    await withRetry(() => interaction.deferReply());

    // 4. Execute action
    const result = await executeUndoAction(
      {
        guildId,
        config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      { actionId }
    );

    // 5. Handle response
    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply({ content: result.actionText });
  },
};
