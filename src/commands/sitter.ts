import { ChatInputCommandInteraction, AutocompleteInteraction, MessageFlags } from "discord.js";
import { Command } from "../types";
import { addSitter, removeSitter, getAllPlayers } from "../services/player-accounts";
import { guildCommand, requireGuild } from "./shared";
import { filterChoices } from "../utils/choices";

export const sitterCommand: Command = {
  topic: "you",
  summary: "Tell the bot which accounts you sit",
  data: guildCommand("sitter", "Tell the bot which accounts you sit")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Mark yourself as a sitter for one or more players")
        .addStringOption((option) =>
          option
            .setName("names")
            .setDescription("Player names, comma-separated, for example: Player1, Player2")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("del")
        .setDescription("Stop being a sitter for one or more players")
        .addStringOption((option) =>
          option
            .setName("names")
            .setDescription("Player names, comma-separated, for example: Player1, Player2")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.respond([]);
      return;
    }
    // Complete the last comma-separated token; keep the earlier ones as typed.
    const typed = interaction.options.getFocused();
    const parts = typed.split(",");
    const last = parts.pop() ?? "";
    const prefix = parts.map((p) => p.trim()).filter(Boolean);
    const choices = getAllPlayers(guildId)
      .map((p) => p.name)
      .filter((name) => !prefix.includes(name))
      .map((name) => ({ name, value: name }));
    await interaction.respond(
      filterChoices(choices, last).map((c) => {
        const value = [...prefix, c.value].join(", ");
        return { name: value.length > 100 ? c.name : value, value: value.slice(0, 100) };
      })
    );
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

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
      content: "⚠️ **Enter at least one player name.**",
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
      content: "⚠️ **Enter at least one player name.**",
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
