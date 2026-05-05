import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { getRequestByChannelId } from "../services/def-calls";
import { executeDefCallCloseAction } from "../actions";
import { isAdmin } from "../utils/permissions";
import { withRetry } from "../utils/retry";

export const closeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Uždaryti gynybos prašymą (naudok prašymo kanale)"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "Ši komanda veikia tik serveryje.",
        ephemeral: true,
      });
      return;
    }

    const channelId = interaction.channelId;
    const requestData = getRequestByChannelId(guildId, channelId);
    if (!requestData) {
      await interaction.reply({
        content: "Šis kanalas nėra gynybos prašymo kanalas.",
        ephemeral: true,
      });
      return;
    }

    await withRetry(() => interaction.deferReply({ ephemeral: true }));

    const config = getGuildConfig(guildId);
    const userIsAdmin = isAdmin(interaction.member as GuildMember | null);

    const result = await executeDefCallCloseAction(
      {
        guildId,
        config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      { requestId: requestData.requestId },
      { isAdmin: userIsAdmin }
    );

    if (!result.success) {
      try {
        await interaction.editReply({ content: result.error });
      } catch {
        // ignore
      }
      return;
    }

    try {
      await interaction.editReply({ content: "Prašymas uždarytas, kanalas šalinamas." });
    } catch {
      // channel might be gone already
    }
  },
};
