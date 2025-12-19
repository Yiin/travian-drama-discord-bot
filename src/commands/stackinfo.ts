import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { updateGlobalMessage } from "../services/defense-message";
import { withRetry } from "../utils/retry";

export const stackinfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stackinfo")
    .setDescription("Re-post the defense request list"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
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

    await withRetry(() => interaction.deferReply({ ephemeral: true }));

    await updateGlobalMessage(interaction.client, guildId);

    await interaction.editReply({
      content: "Gynybos sąrašas atnaujintas.",
    });
  },
};
