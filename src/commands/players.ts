import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../types";
import { getAllPlayers } from "../services/player-accounts";

export const playersCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("players")
    .setDescription("List all players with their Discord users and sitters"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const players = getAllPlayers(guildId);

    if (players.length === 0) {
      await interaction.reply({
        content:
          "No players registered yet. Use `/account set` to associate yourself with an in-game account.",
        ephemeral: true,
      });
      return;
    }

    const lines: string[] = [];

    for (const player of players) {
      const ownerMentions = player.owners.map((id) => `<@${id}>`).join(", ");
      const sitterMentions = player.sitters.map((id) => `<@${id}>`).join(", ");

      let line = `**${player.name}**: `;

      if (player.owners.length > 0) {
        line += ownerMentions;
      } else {
        line += "_no owner_";
      }

      if (player.sitters.length > 0) {
        line += ` (sitters: ${sitterMentions})`;
      }

      lines.push(line);
    }

    const response = lines.join("\n");

    // Discord has a 2000 character limit for messages
    if (response.length > 1900) {
      // Split into multiple messages if needed
      const chunks: string[] = [];
      let currentChunk = "";

      for (const line of lines) {
        if (currentChunk.length + line.length + 1 > 1900) {
          chunks.push(currentChunk);
          currentChunk = line;
        } else {
          currentChunk += (currentChunk ? "\n" : "") + line;
        }
      }
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      await interaction.reply({ content: chunks[0] });
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i] });
      }
    } else {
      await interaction.reply({ content: response });
    }
  },
};
