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
import { withRetry } from "../utils/retry";

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
        content: "Ši komanda veikia tik serveryje.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content: "Travian serveris nesukonfigūruotas. Adminas turi paleisti `/setserver`.",
        ephemeral: true,
      });
      return;
    }

    const coords = parseCoords(coordsInput);
    if (!coords) {
      await interaction.reply({
        content: "Neteisingos koordinatės. Įvesk du skaičius (pvz., 123|456, 123 456).",
        ephemeral: true,
      });
      return;
    }

    await withRetry(() => interaction.deferReply());

    // Ensure map data is available
    const dataReady = await ensureMapData(config.serverKey);
    if (!dataReady) {
      await interaction.editReply({
        content: "Nepavyko užkrauti žemėlapio duomenų. Bandyk vėliau.",
      });
      return;
    }

    const village = await getVillageAt(config.serverKey, coords.x, coords.y);

    if (!village) {
      await interaction.editReply({
        content: `Kaimas koordinatėse (${coords.x}|${coords.y}) nerastas.`,
      });
      return;
    }

    const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId, 1);
    const tribeName = getTribeName(village.tribe);

    const embed = new EmbedBuilder()
      .setTitle(`Kaimas (${coords.x}|${coords.y})`)
      .setColor(Colors.Green)
      .addFields(
        { name: "Kaimas", value: village.villageName || "Nežinomas", inline: true },
        { name: "Populiacija", value: village.population.toString(), inline: true },
        { name: "Tauta", value: tribeName, inline: true },
        { name: "Žaidėjas", value: village.playerName || "Nežinomas", inline: true },
        {
          name: "Aljansas",
          value: village.allianceName || "Nėra",
          inline: true,
        },
        {
          name: "Siųsti karius",
          value: `[Susirinkimo taškas](${rallyLink})`,
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
