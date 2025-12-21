import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { validateDefenseConfig, executeDeleteDefAction } from "../actions";
import { withRetry } from "../utils/retry";

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
    // 1. Validate configuration
    const validation = validateDefenseConfig(interaction.guildId);
    if (!validation.valid) {
      await interaction.reply({ content: validation.error, ephemeral: true });
      return;
    }

    // 2. Parse inputs
    const requestId = interaction.options.getInteger("id", true);

    // 3. Defer reply
    await withRetry(() => interaction.deferReply());

    // 4. Execute action
    const result = await executeDeleteDefAction(
      {
        guildId: validation.guildId,
        config: validation.config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      { requestId }
    );

    // 5. Handle response
    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply({ content: result.actionText });
  },
};
