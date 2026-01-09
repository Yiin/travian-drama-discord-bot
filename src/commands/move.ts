import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { validateDefenseConfig, executeMoveAction } from "../actions";
import { withRetry } from "../utils/retry";

export const moveCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a defense request to a different position")
    .addIntegerOption((option) =>
      option
        .setName("from")
        .setDescription("The defense request ID to move")
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((option) =>
      option
        .setName("to")
        .setDescription("The target position")
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
    const fromPosition = interaction.options.getInteger("from", true);
    const toPosition = interaction.options.getInteger("to", true);

    // 3. Defer reply
    await withRetry(() => interaction.deferReply());

    // 4. Execute action
    const result = await executeMoveAction(
      {
        guildId: validation.guildId,
        config: validation.config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      { fromPosition, toPosition }
    );

    // 5. Handle response
    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply({ content: result.actionText });
  },
};
