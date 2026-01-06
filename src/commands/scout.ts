import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { withRetry } from "../utils/retry";
import { executeScoutAction, sendScoutMessage } from "../actions";

export const scoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("scout")
    .setDescription("Send a scouting request")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Coordinates (e.g., 123|456, 123 456, (123|456))")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Additional information about the scouting request")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const coordsInput = interaction.options.getString("coords", true);
    const message = interaction.options.getString("message", true);
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
        content:
          "Travian serveris nesukonfigūruotas. Adminas turi panaudoti `/setserver`.",
        ephemeral: true,
      });
      return;
    }

    if (!config.scoutChannelId) {
      await interaction.reply({
        content:
          "Žvalgybos kanalas nesukonfigūruotas. Adminas turi panaudoti `/setchannel type:Scout`.",
        ephemeral: true,
      });
      return;
    }

    // Defer reply as map data lookup may take time
    await withRetry(() => interaction.deferReply({ ephemeral: true }));

    // Execute the scout action
    const result = await executeScoutAction(
      {
        guildId,
        config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      {
        coords: coordsInput,
        message,
        requesterId: interaction.user.id,
        scoutRoleId: config.scoutRoleId,
      }
    );

    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    // Send the scout message to the channel
    const sent = await sendScoutMessage(interaction.client, config.scoutChannelId, {
      ...result,
      message,
      requesterId: interaction.user.id,
      scoutRoleId: config.scoutRoleId,
    });

    if (!sent) {
      await interaction.editReply({
        content: "Sukonfigūruotas žvalgybos kanalas nerastas.",
      });
      return;
    }

    // Delete the deferred reply since the scout request is posted to the channel
    await interaction.deleteReply();
  },
};
