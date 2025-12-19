import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types";
import { setServerKey } from "../config/guild-config";
import { updateMapData } from "../services/map-data";

function normalizeServerKey(input: string): string {
  let key = input.trim().toLowerCase();

  // Remove protocol if present
  key = key.replace(/^https?:\/\//, "");

  // Remove .travian.com suffix if present
  key = key.replace(/\.travian\.com\/?$/, "");

  // Remove trailing slash
  key = key.replace(/\/+$/, "");

  return key;
}

function isValidServerKey(key: string): boolean {
  // Should be like: ts31.x3.europe or ts5.x1.international
  // Basic validation: should have dots, no spaces, alphanumeric with dots
  return /^[a-z0-9]+(\.[a-z0-9]+)+$/.test(key);
}

export const setserverCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("setserver")
    .setDescription("Configure the Travian gameworld for map lookups")
    .addStringOption((option) =>
      option
        .setName("server")
        .setDescription("The Travian server (e.g., ts31.x3.europe)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const serverInput = interaction.options.getString("server", true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const serverKey = normalizeServerKey(serverInput);

    if (!isValidServerKey(serverKey)) {
      await interaction.reply({
        content: "Invalid server. Please provide a valid Travian server (e.g., ts31.x3.europe)",
        ephemeral: true,
      });
      return;
    }

    // Defer reply as download may take time
    await interaction.deferReply({ ephemeral: true });

    try {
      // Save the server key (short form)
      setServerKey(guildId, serverKey);

      // Download map data
      await updateMapData(serverKey);

      await interaction.editReply({
        content: `Travian server set to \`${serverKey}\`\nMap data downloaded successfully!`,
      });
    } catch (error) {
      console.error("[SetServer] Failed to download map data:", error);
      await interaction.editReply({
        content: `Server saved as \`${serverKey}\`, but failed to download map data. The bot will retry later.`,
      });
    }
  },
};
