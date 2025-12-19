import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { getGuildConfig } from "../config/guild-config";
import {
  getVillageAt,
  getRallyPointLink,
  getTribeName,
  ensureMapData,
} from "../services/map-data";

export const lookupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Look up village information by coordinates")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Coordinates (e.g., 123|456, 123 456, (123|456))")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const coordsInput = interaction.options.getString("coords", true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content: "Travian server not configured. An admin must run `/setserver` first.",
        ephemeral: true,
      });
      return;
    }

    const coords = parseCoords(coordsInput);
    if (!coords) {
      await interaction.reply({
        content: "Invalid coordinates. Please provide two numbers (e.g., 123|456, 123 456).",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    // Ensure map data is available
    const dataReady = await ensureMapData(config.serverKey);
    if (!dataReady) {
      await interaction.editReply({
        content: "Failed to load map data. Please try again later.",
      });
      return;
    }

    const village = await getVillageAt(config.serverKey, coords.x, coords.y);

    if (!village) {
      await interaction.editReply({
        content: `No village found at coordinates (${coords.x}|${coords.y}).`,
      });
      return;
    }

    const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId);
    const tribeName = getTribeName(village.tribe);

    const embed = new EmbedBuilder()
      .setTitle(`Village at (${coords.x}|${coords.y})`)
      .setColor(Colors.Green)
      .addFields(
        { name: "Village", value: village.villageName || "Unknown", inline: true },
        { name: "Population", value: village.population.toString(), inline: true },
        { name: "Tribe", value: tribeName, inline: true },
        { name: "Player", value: village.playerName || "Unknown", inline: true },
        {
          name: "Alliance",
          value: village.allianceName || "None",
          inline: true,
        },
        {
          name: "Send Troops",
          value: `[Rally Point](${rallyLink})`,
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
