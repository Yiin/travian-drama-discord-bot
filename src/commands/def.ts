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
    .setDescription("Sukurti gynybos prašymą")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Koordinatės (pvz. 123|456)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("landing")
        .setDescription("Atakos kritimo laikas (HH:MM, HH:MM:SS arba Travian formatas)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("comment")
        .setDescription("Komentaras (nebūtina)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "Ši komanda veikia tik serveryje.",
        ephemeral: true,
      });
      return;
    }

    const coords = interaction.options.getString("coords", true);
    const landing = interaction.options.getString("landing", true);
    const comment = interaction.options.getString("comment") || undefined;

    await withRetry(() => interaction.deferReply({ ephemeral: true }));

    const config = getGuildConfig(guildId);
    const result = await executeDefCallRequestAction(
      {
        guildId,
        config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      { coords, landing, comment }
    );

    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply({ content: result.actionText });
  },
};
