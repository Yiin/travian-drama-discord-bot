import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { withRetry } from "../utils/retry";
import { executeScoutAction, sendScoutMessage } from "../actions";
import { errors, confirmationEdit, channelUrl } from "../actions/messages";
import { guildCommand, requireGuild } from "./shared";

export const scoutCommand: Command = {
  topic: "scouting",
  summary: "Ask the scouts to check a village",
  data: guildCommand("scout", "Scouting requests")
    .addSubcommand((sub) =>
      sub
        .setName("request")
        .setDescription("Ask the scouts to check a village")
        .addStringOption((opt) =>
          opt.setName("coords").setDescription("Village coordinates, for example 123|456").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("What to look for, for example: WWK or fake?").setRequired(true).setMaxLength(200)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({ content: errors.notSetUp(), flags: MessageFlags.Ephemeral });
      return;
    }
    if (!config.scoutChannelId) {
      await interaction.reply({ content: errors.channelMissing("scout"), flags: MessageFlags.Ephemeral });
      return;
    }

    const coordsInput = interaction.options.getString("coords", true);
    const note = interaction.options.getString("note", true);

    await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

    const result = await executeScoutAction(
      { guildId, config, client: interaction.client, userId: interaction.user.id },
      { coords: coordsInput, message: note, requesterId: interaction.user.id, scoutRoleId: config.scoutRoleId }
    );

    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    const sent = await sendScoutMessage(interaction.client, config.scoutChannelId, {
      ...result,
      message: note,
      requesterId: interaction.user.id,
      scoutRoleId: config.scoutRoleId,
    });

    if (!sent) {
      await interaction.editReply({ content: errors.channelGone("scout") });
      return;
    }

    await interaction.editReply(
      confirmationEdit(`✅ Scout request posted for ${result.villageDisplay}.`, {
        panelUrl: channelUrl(guildId, config.scoutChannelId),
        panelLabel: "Open channel",
      })
    );
  },
};
