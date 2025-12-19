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
  VillageData,
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

    const channel = (await interaction.client.channels.fetch(
      config.scoutChannelId
    )) as TextChannel | null;

    if (!channel) {
      await interaction.reply({
        content: "Configured scout channel not found.",
        ephemeral: true,
      });
      return;
    }

    // Try to get village data if server is configured
    let village: VillageData | null = null;
    if (config.serverKey) {
      village = await getVillageAt(config.serverKey, coords.x, coords.y);
    }

    const embed = new EmbedBuilder()
      .setTitle("Scout Request")
      .setColor(Colors.Blue)
      .addFields(
        { name: "Coordinates", value: `(${coords.x}|${coords.y})`, inline: true }
      );

    // Add village info if available
    if (village && config.serverKey) {
      const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId);
      const allianceDisplay = village.allianceName
        ? ` [${village.allianceName}]`
        : "";

      embed.addFields(
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
        { name: "Send Scouts", value: `[Rally Point](${rallyLink})`, inline: false }
      );
    }

    embed.addFields(
      { name: "Message", value: message },
      { name: "Requested by", value: `${interaction.user}`, inline: true }
    );

    embed.setTimestamp();

    await channel.send({ embeds: [embed] });

    await interaction.reply({
      content: `Scout request sent to <#${config.scoutChannelId}>`,
      ephemeral: true,
    });
  },
};
