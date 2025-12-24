import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { getGuildConfig } from "../config/guild-config";
import {
  getVillageAt,
  getRallyPointLink,
  getTribeName,
  ensureMapData,
  getMapLink,
  searchPlayersByName,
  getVillagesByPlayerName,
  PlayerSearchResult,
  VillageData,
} from "../services/map-data";
import { getPlayerHistoryByName, formatPopulationTrend } from "../services/population-history";
import { withRetry } from "../utils/retry";

// ============================================
// Exported embed builders for reuse
// ============================================

export function buildVillageEmbed(
  village: VillageData,
  coords: { x: number; y: number },
  rallyLink: string,
  tribeName: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`Kaimas (${coords.x}|${coords.y})`)
    .setColor(Colors.Green)
    .addFields(
      { name: "Kaimas", value: village.villageName || "Nežinomas", inline: true },
      { name: "Populiacija", value: village.population.toString(), inline: true },
      { name: "Tauta", value: tribeName, inline: true },
      { name: "Žaidėjas", value: village.playerName || "Nežinomas", inline: true },
      { name: "Aljansas", value: village.allianceName || "Nėra", inline: true },
      { name: "Siųsti karius", value: `[Susirinkimo taškas](${rallyLink})`, inline: false }
    )
    .setTimestamp();
}

export function buildPlayerEmbed(
  player: PlayerSearchResult,
  villages: VillageData[],
  serverKey: string
): EmbedBuilder {
  const firstVillage = villages[0];
  const tribeName = getTribeName(firstVillage.tribe);

  // Build villages list (limit to 10 for embed)
  const villageLines: string[] = [];
  const displayVillages = villages.slice(0, 10);
  for (const v of displayVillages) {
    const mapLink = getMapLink(serverKey, { x: v.x, y: v.y });
    villageLines.push(
      `[(${v.x}|${v.y})](${mapLink}) **${v.villageName}** - ${v.population.toLocaleString()} pop`
    );
  }
  if (villages.length > 10) {
    villageLines.push(`... ir dar ${villages.length - 10} kaimų`);
  }

  // Get population trend
  const trends = getPlayerHistoryByName(serverKey, player.playerName);
  const trendDisplay = formatPopulationTrend(trends);

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle(`Žaidėjas: ${player.playerName}`)
    .setColor(Colors.Blue)
    .addFields(
      {
        name: "Bendra populiacija",
        value: player.totalPopulation.toLocaleString(),
        inline: true,
      },
      { name: "Kaimų skaičius", value: villages.length.toString(), inline: true },
      { name: "Tauta", value: tribeName, inline: true },
      { name: "Aljansas", value: player.allianceName || "Nėra", inline: true },
      { name: "Miestai", value: villageLines.join("\n"), inline: false }
    );

  // Add trend field if we have history
  if (trends.length > 0) {
    const trendEmoji =
      trendDisplay.changeDirection === "up"
        ? "📈"
        : trendDisplay.changeDirection === "down"
          ? "📉"
          : "➡️";
    const changeText =
      trendDisplay.totalChange !== 0
        ? ` (${trendDisplay.totalChange > 0 ? "+" : ""}${trendDisplay.totalChange.toLocaleString()} per ${trends.length} d.)`
        : "";

    embed.addFields({
      name: `${trendEmoji} Populiacijos istorija${changeText}`,
      value: trendDisplay.lines.join("\n"),
      inline: false,
    });
  }

  embed.setTimestamp();
  return embed;
}

// ============================================
// Slash command
// ============================================

const PLAYER_SELECT_ID = "lookup_player_select";

export const lookupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Rasti informaciją pagal koordinates arba žaidėjo vardą")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Koordinatės (pvz., 123|456) arba žaidėjo vardas")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const queryInput = interaction.options.getString("query", true);
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
        content: "Travian serveris nesukonfigūruotas. Adminas turi paleisti `/configure`.",
        ephemeral: true,
      });
      return;
    }

    // Try parsing as coordinates first
    const coords = parseCoords(queryInput);

    if (coords) {
      await handleCoordinateLookup(interaction, config.serverKey, coords);
    } else {
      await handlePlayerLookup(interaction, config.serverKey, queryInput);
    }
  },
};

async function handleCoordinateLookup(
  interaction: ChatInputCommandInteraction,
  serverKey: string,
  coords: { x: number; y: number }
): Promise<void> {
  await withRetry(() => interaction.deferReply());

  const dataReady = await ensureMapData(serverKey);
  if (!dataReady) {
    await interaction.editReply({
      content: "Nepavyko užkrauti žemėlapio duomenų. Bandyk vėliau.",
    });
    return;
  }

  const village = await getVillageAt(serverKey, coords.x, coords.y);

  if (!village) {
    await interaction.editReply({
      content: `Kaimas koordinatėse (${coords.x}|${coords.y}) nerastas.`,
    });
    return;
  }

  const rallyLink = getRallyPointLink(serverKey, village.targetMapId, 1);
  const tribeName = getTribeName(village.tribe);
  const embed = buildVillageEmbed(village, coords, rallyLink, tribeName);

  await interaction.editReply({ embeds: [embed] });
}

async function handlePlayerLookup(
  interaction: ChatInputCommandInteraction,
  serverKey: string,
  playerName: string
): Promise<void> {
  await withRetry(() => interaction.deferReply());

  const dataReady = await ensureMapData(serverKey);
  if (!dataReady) {
    await interaction.editReply({
      content: "Nepavyko užkrauti žemėlapio duomenų. Bandyk vėliau.",
    });
    return;
  }

  // Search for matching players
  const matchingPlayers = await searchPlayersByName(serverKey, playerName, 25);

  if (matchingPlayers.length === 0) {
    await interaction.editReply({
      content: `Žaidėjas "${playerName}" nerastas.`,
    });
    return;
  }

  if (matchingPlayers.length === 1) {
    // Single match - show full details
    await showPlayerDetails(interaction, serverKey, matchingPlayers[0]);
    return;
  }

  // Multiple matches - show select menu
  const options = matchingPlayers.map((player) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(player.playerName)
      .setDescription(
        `${player.totalPopulation.toLocaleString()} pop, ${player.villageCount} miestai`
      )
      .setValue(player.playerId.toString())
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(PLAYER_SELECT_ID)
    .setPlaceholder("Pasirink žaidėją...")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const response = await interaction.editReply({
    content: `Rasta ${matchingPlayers.length} žaidėjų su vardu "${playerName}". Pasirink:`,
    components: [row],
  });

  // Wait for selection (60 second timeout)
  try {
    const selectInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id && i.customId === PLAYER_SELECT_ID,
      time: 60_000,
    });

    const selectedPlayerId = parseInt(selectInteraction.values[0], 10);
    const selectedPlayer = matchingPlayers.find((p) => p.playerId === selectedPlayerId);

    await selectInteraction.deferUpdate();

    if (selectedPlayer) {
      await showPlayerDetails(interaction, serverKey, selectedPlayer);
    }
  } catch {
    // Timeout - remove the select menu
    await interaction.editReply({
      content: "Laikas baigėsi. Paleisk komandą iš naujo.",
      components: [],
    });
  }
}

async function showPlayerDetails(
  interaction: ChatInputCommandInteraction,
  serverKey: string,
  player: PlayerSearchResult
): Promise<void> {
  // Get all villages for this player by name (more reliable than by ID)
  const villages = await getVillagesByPlayerName(serverKey, player.playerName);

  if (villages.length === 0) {
    await interaction.editReply({
      content: "Žaidėjo kaimų nerasta.",
      components: [],
    });
    return;
  }

  const embed = buildPlayerEmbed(player, villages, serverKey);

  await interaction.editReply({
    content: null,
    embeds: [embed],
    components: [],
  });
}
