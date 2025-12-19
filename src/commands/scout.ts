import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { getGuildConfig } from "../config/guild-config";
import {
  getVillageAt,
  getRallyPointLink,
  ensureMapData,
  getMapLink,
} from "../services/map-data";
import { withRetry } from "../utils/retry";

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
        content: "Ši komanda veikia tik serveryje.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content:
          "Travian serveris nesukonfigūruotas. Adminas turi paleisti `/setserver`.",
        ephemeral: true,
      });
      return;
    }

    if (!config.scoutChannelId) {
      await interaction.reply({
        content:
          "Žvalgybos kanalas nesukonfigūruotas. Adminas turi paleisti `/setchannel type:Scout`.",
        ephemeral: true,
      });
      return;
    }

    const coords = parseCoords(coordsInput);
    if (!coords) {
      await interaction.reply({
        content:
          "Neteisingos koordinatės. Įvesk du skaičius (pvz., 123|456, 123 456).",
        ephemeral: true,
      });
      return;
    }

    // Defer reply as map data lookup may take time
    await withRetry(() => interaction.deferReply({ ephemeral: true }));

    // Ensure map data is available
    const dataReady = await ensureMapData(config.serverKey);
    if (!dataReady) {
      await interaction.editReply({
        content: "Nepavyko užkrauti žemėlapio duomenų. Bandyk vėliau.",
      });
      return;
    }

    // Validate village exists at coordinates
    const village = await getVillageAt(config.serverKey, coords.x, coords.y);
    if (!village) {
      await interaction.editReply({
        content: `Kaimas koordinatėse (${coords.x}|${coords.y}) nerastas. Patikrink koordinates ir bandyk dar kartą.`,
      });
      return;
    }

    const channel = (await interaction.client.channels.fetch(
      config.scoutChannelId
    )) as TextChannel | null;

    if (!channel) {
      await interaction.editReply({
        content: "Sukonfigūruotas žvalgybos kanalas nerastas.",
      });
      return;
    }

    const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId, 3);

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setDescription(
        `[(${coords.x}|${coords.y})](${getMapLink(config.serverKey, village)}) **${village.villageName}** ${village.population} pop (${village.playerName}) [**[ SIŲSTI ]**](${rallyLink}) - ${message}`
      )
      .setFooter({ text: `Paprašė ${interaction.user.displayName}` });

    await channel.send({ embeds: [embed] });

    const playerInfo = village.allianceName
      ? `${village.playerName} [${village.allianceName}]`
      : village.playerName;
    await interaction.editReply({
      content: `Žvalgybos prašymas užfiksuotas į **${village.villageName}** (${coords.x}|${coords.y}) - ${playerInfo} - <#${config.scoutChannelId}>`,
    });
  },
};
