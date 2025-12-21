import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { validateDefenseConfig, executeDefAction } from "../actions";
import { withRetry } from "../utils/retry";

export const defCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("def")
    .setDescription("Create or update a defense request")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Coordinates (e.g., 123|456, 123 456, (123|456))")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Number of troops needed")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Additional information about the defense request")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // 1. Validate configuration
    const validation = validateDefenseConfig(interaction.guildId);
    if (!validation.valid) {
      await interaction.reply({ content: validation.error, ephemeral: true });
      return;
    }

    // 2. Parse inputs
    const coordsInput = interaction.options.getString("coords", true);
    const troopsNeeded = interaction.options.getInteger("troops", true);
    const message = interaction.options.getString("message") || "";

    // 3. Defer reply
    await withRetry(() => interaction.deferReply());

    // 4. Execute action
    const result = await executeDefAction(
      {
        guildId: validation.guildId,
        config: validation.config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      {
        coords: coordsInput,
        troopsNeeded,
        message,
      }
    );

    // 5. Handle response
    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply({ content: result.actionText });
  },
};
