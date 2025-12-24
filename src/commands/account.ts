import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../types";
import {
  setAccount,
  deleteAccount,
  getAccountForUser,
} from "../services/player-accounts";

export const accountCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("account")
    .setDescription("Manage your in-game account association")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set your in-game player name")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Your in-game player name")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("del")
        .setDescription("Remove your in-game account association")
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

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set") {
      await handleSetAccount(interaction, guildId);
    } else if (subcommand === "del") {
      await handleDeleteAccount(interaction, guildId);
    }
  },
};

async function handleSetAccount(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const inGameName = interaction.options.getString("name", true).trim();
  const userId = interaction.user.id;

  if (!inGameName) {
    await interaction.reply({
      content: "Please provide a valid in-game name.",
      ephemeral: true,
    });
    return;
  }

  const previousName = getAccountForUser(guildId, userId);
  setAccount(guildId, userId, inGameName);

  if (previousName && previousName !== inGameName) {
    await interaction.reply({
      content: `Updated your account from **${previousName}** to **${inGameName}**.`,
      ephemeral: true,
    });
  } else if (previousName === inGameName) {
    await interaction.reply({
      content: `You are already associated with **${inGameName}**.`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `You are now associated with in-game account **${inGameName}**.`,
      ephemeral: true,
    });
  }
}

async function handleDeleteAccount(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const userId = interaction.user.id;
  const previousName = getAccountForUser(guildId, userId);

  if (!previousName) {
    await interaction.reply({
      content: "You don't have an in-game account associated.",
      ephemeral: true,
    });
    return;
  }

  deleteAccount(guildId, userId);
  await interaction.reply({
    content: `Removed your association with **${previousName}**.`,
    ephemeral: true,
  });
}
