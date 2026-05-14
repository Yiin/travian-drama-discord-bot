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
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content: "Travian server is not configured. An admin must use `/setserver`.",
        ephemeral: true,
      });
      return;
    }

    if (!config.defenseChannelId) {
      await interaction.reply({
        content: "Defense channel is not configured. An admin must use `/setchannel type:Defense`.",
        ephemeral: true,
      });
      return;
    }

    await withRetry(() => interaction.deferReply({ ephemeral: true }));

    await updateGlobalMessage(interaction.client, guildId);

    await interaction.editReply({
      content: "Defense list updated.",
    });
  },
};
