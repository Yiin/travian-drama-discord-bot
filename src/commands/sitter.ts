import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { Command } from "../types";
import { addSitter, removeSitter } from "../services/player-accounts";
import { errors } from "../actions/messages";

export const sitterCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("sitter")
    .setDescription("Manage your sitter associations")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Mark yourself as a sitter for one or more players")
        .addStringOption((option) =>
          option
            .setName("names")
            .setDescription(
              "Player names you sit for (comma-separated, e.g., Player1, Player2)"
            )
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("del")
        .setDescription("Remove yourself as a sitter for one or more players")
        .addStringOption((option) =>
          option
            .setName("names")
            .setDescription(
              "Player names to stop sitting (comma-separated, e.g., Player1, Player2)"
            )
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: errors.guildOnly(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set") {
      await handleAddSitter(interaction, guildId);
    } else if (subcommand === "del") {
      await handleRemoveSitter(interaction, guildId);
    }
  },
};

function parseNames(input: string): string[] {
  return input
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

async function handleAddSitter(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const namesInput = interaction.options.getString("names", true);
  const userId = interaction.user.id;
  const names = parseNames(namesInput);

  if (names.length === 0) {
    await interaction.reply({
      content: "Please provide at least one valid player name.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const added = addSitter(guildId, userId, names);

  if (added.length === 0) {
    await interaction.reply({
      content: `You are already a sitter for: **${names.join("**, **")}**`,
      flags: MessageFlags.Ephemeral,
    });
  } else if (added.length === names.length) {
    await interaction.reply({
      content: `You are now a sitter for: **${added.join("**, **")}**`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    const alreadySitting = names.filter((n) => !added.includes(n));
    await interaction.reply({
      content: `Added as sitter for: **${added.join("**, **")}**\nAlready sitting: **${alreadySitting.join("**, **")}**`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleRemoveSitter(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const namesInput = interaction.options.getString("names", true);
  const userId = interaction.user.id;
  const names = parseNames(namesInput);

  if (names.length === 0) {
    await interaction.reply({
      content: "Please provide at least one valid player name.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const removed = removeSitter(guildId, userId, names);

  if (removed.length === 0) {
    await interaction.reply({
      content: `You are not a sitter for any of: **${names.join("**, **")}**`,
      flags: MessageFlags.Ephemeral,
    });
  } else if (removed.length === names.length) {
    await interaction.reply({
      content: `Removed as sitter for: **${removed.join("**, **")}**`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    const notSitting = names.filter((n) => !removed.includes(n));
    await interaction.reply({
      content: `Removed as sitter for: **${removed.join("**, **")}**\nWasn't sitting: **${notSitting.join("**, **")}**`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
