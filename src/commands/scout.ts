import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  Colors,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { getGuildConfig } from "../config/guild-config";
import {
  getVillageAt,
  getRallyPointLink,
  ensureMapData,
} from "../services/map-data";

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
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content:
          "Travian server not configured. An admin must run `/setserver` first.",
        ephemeral: true,
      });
      return;
    }

    if (!config.scoutChannelId) {
      await interaction.reply({
        content:
          "Scout channel not configured. An admin must run `/setchannel type:Scout` first.",
        ephemeral: true,
      });
      return;
    }

    const coords = parseCoords(coordsInput);
    if (!coords) {
      await interaction.reply({
        content:
          "Invalid coordinates. Please provide two numbers (e.g., 123|456, 123 456).",
        ephemeral: true,
      });
      return;
    }

    // Defer reply as map data lookup may take time
    await interaction.deferReply({ ephemeral: true });

    // Ensure map data is available
    const dataReady = await ensureMapData(config.serverKey);
    if (!dataReady) {
      await interaction.editReply({
        content: "Failed to load map data. Please try again later.",
      });
      return;
    }

    // Validate village exists at coordinates
    const village = await getVillageAt(config.serverKey, coords.x, coords.y);
    if (!village) {
      await interaction.editReply({
        content: `No village found at coordinates (${coords.x}|${coords.y}). Please check the coordinates and try again.`,
      });
      return;
    }

    const channel = (await interaction.client.channels.fetch(
      config.scoutChannelId
    )) as TextChannel | null;

    if (!channel) {
      await interaction.editReply({
        content: "Configured scout channel not found.",
      });
      return;
    }

    const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId);
    const allianceDisplay = village.allianceName
      ? ` [${village.allianceName}]`
      : "";

    const embed = new EmbedBuilder()
      .setTitle("Scout Request")
      .setColor(Colors.Blue)
      .addFields(
        { name: "Coordinates", value: `(${coords.x}|${coords.y})`, inline: true },
        {
          name: "Village",
          value: `${village.villageName} (${village.population} pop)`,
          inline: true,
        },
        {
          name: "Player",
          value: `${village.playerName}${allianceDisplay}`,
          inline: true,
        },
        { name: "Send Scouts", value: `[Rally Point](${rallyLink})`, inline: false },
        { name: "Message", value: message },
        { name: "Requested by", value: `${interaction.user}`, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    const playerInfo = village.allianceName
      ? `${village.playerName} [${village.allianceName}]`
      : village.playerName;
    await interaction.editReply({
      content: `Scout request for **${village.villageName}** (${coords.x}|${coords.y}) - ${playerInfo} - sent to <#${config.scoutChannelId}>`,
    });
  },
};
