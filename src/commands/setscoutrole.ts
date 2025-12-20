import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types";
import { setScoutRole, getGuildConfig } from "../config/guild-config";

export const setscoutroleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("setscoutrole")
    .setDescription("Set or clear the role to mention for scout requests")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("The role to mention (leave empty to clear)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const role = interaction.options.getRole("role");
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    if (role) {
      setScoutRole(guildId, role.id);
      await interaction.reply({
        content: `Scout requests will now mention <@&${role.id}>`,
        ephemeral: true,
      });
    } else {
      const config = getGuildConfig(guildId);
      if (config.scoutRoleId) {
        setScoutRole(guildId, null);
        await interaction.reply({
          content: "Scout role mention has been cleared.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "No scout role is currently configured.",
          ephemeral: true,
        });
      }
    }
  },
};
