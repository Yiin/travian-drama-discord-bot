import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import { Command } from "../types";
import { setDefenseChannel, setScoutChannel } from "../config/guild-config";

export const setchannelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("Configure defense or scout request channels")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("The type of channel to configure")
        .setRequired(true)
        .addChoices(
          { name: "Defense", value: "defense" },
          { name: "Scout", value: "scout" }
        )
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel to send requests to")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const type = interaction.options.getString("type", true);
    const channel = interaction.options.getChannel("channel", true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    if (type === "defense") {
      setDefenseChannel(guildId, channel.id);
      await interaction.reply({
        content: `Defense requests will now be sent to <#${channel.id}>`,
        ephemeral: true,
      });
    } else {
      setScoutChannel(guildId, channel.id);
      await interaction.reply({
        content: `Scout requests will now be sent to <#${channel.id}>`,
        ephemeral: true,
      });
    }
  },
};
