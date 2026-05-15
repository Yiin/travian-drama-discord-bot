import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { executeDefCallRequestAction } from "../actions";
import { withRetry } from "../utils/retry";

export const defCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("def")
    .setDescription("Create a defense request")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Coordinates (for example, 123|456)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("landing")
        .setDescription("Attack landing time (HH:MM, HH:MM:SS, or Travian format)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("comment")
        .setDescription("Comment (optional)")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Troop limit — thread is marked ✅ when reached (optional)")
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const coords = interaction.options.getString("coords", true);
    const landing = interaction.options.getString("landing", true);
    const comment = interaction.options.getString("comment") || undefined;
    const troopsNeeded = interaction.options.getInteger("troops") ?? undefined;

    await withRetry(() => interaction.deferReply({ ephemeral: true }));

    const config = getGuildConfig(guildId);
    const result = await executeDefCallRequestAction(
      {
        guildId,
        config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      { coords, landing, comment, troopsNeeded }
    );

    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply({ content: result.actionText });
  },
};
