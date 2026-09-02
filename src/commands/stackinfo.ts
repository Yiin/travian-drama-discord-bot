import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { updateGlobalMessage } from "../services/defense-message";
import { withRetry } from "../utils/retry";
import { errors } from "../actions/messages";

export const stackinfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stackinfo")
    .setDescription("Re-post the defense request list"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: errors.guildOnly(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content: errors.notSetUp(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!config.defenseChannelId) {
      await interaction.reply({
        content: errors.channelMissing("defense"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

    await updateGlobalMessage(interaction.client, guildId);

    await interaction.editReply({
      content: "Defense list updated.",
    });
  },
};
