import { Message } from "discord.js";
import { CommandContext } from "../types";
import { parseCoords } from "../../../utils/parse-coords";
import {
  ensureMapData,
  getVillageAt,
  getRallyPointLink,
  getTribeName,
  searchPlayersByName,
  getVillagesByPlayerName,
  PlayerSearchResult,
} from "../../map-data";
import { buildVillageEmbed, buildPlayerEmbed } from "../../../commands/lookup";
import { errors } from "../../../actions/messages";
import { replyError, rememberAction } from "../utils";

export async function handleLookupCommand(
  ctx: CommandContext,
  queryInput: string
): Promise<void> {
  if (!ctx.config.serverKey) {
    await replyError(ctx, errors.notSetUp());
    return;
  }

  // Try parsing as coordinates first
  const coords = parseCoords(queryInput);

  if (coords) {
    await handleCoordinateLookup(ctx.message, ctx.config.serverKey, coords);
  } else {
    await handlePlayerLookup(ctx.message, ctx.config.serverKey, queryInput);
  }
}

async function handleCoordinateLookup(
  message: Message,
  serverKey: string,
  coords: { x: number; y: number }
): Promise<void> {
  const dataReady = await ensureMapData(serverKey);
  if (!dataReady) {
    await message.reply(errors.mapUnavailable());
    return;
  }

  const village = await getVillageAt(serverKey, coords.x, coords.y);
  if (!village) {
    await message.reply(`Village at coordinates (${coords.x}|${coords.y}) was not found.`);
    return;
  }

  const rallyLink = getRallyPointLink(serverKey, village.targetMapId, 1);
  const tribeName = getTribeName(village.tribe);
  const embed = buildVillageEmbed(village, coords, rallyLink, tribeName);

  await message.reply({ embeds: [embed] });
}

async function handlePlayerLookup(
  message: Message,
  serverKey: string,
  playerName: string
): Promise<void> {
  const dataReady = await ensureMapData(serverKey);
  if (!dataReady) {
    await message.reply(errors.mapUnavailable());
    return;
  }

  const matchingPlayers = await searchPlayersByName(serverKey, playerName, 25);

  if (matchingPlayers.length === 0) {
    await message.reply(`Player "${playerName}" was not found.`);
    return;
  }

  if (matchingPlayers.length === 1) {
    await showPlayerDetailsMessage(message, serverKey, matchingPlayers[0]);
    return;
  }

  // Multiple matches - show list (no interactive menu for text commands)
  const playerList = matchingPlayers.slice(0, 10).map((p, i) =>
    `${i + 1}. **${p.playerName}** - ${p.totalPopulation.toLocaleString()} pop, ${p.villageCount} villages`
  ).join("\n");

  const moreText = matchingPlayers.length > 10
    ? `\n... and ${matchingPlayers.length - 10} more players`
    : "";

  await message.reply(
    `Found ${matchingPlayers.length} players named "${playerName}":\n\n${playerList}${moreText}\n\nRefine the search to get an exact result.`
  );
}

async function showPlayerDetailsMessage(
  message: Message,
  serverKey: string,
  player: PlayerSearchResult
): Promise<void> {
  const villages = await getVillagesByPlayerName(serverKey, player.playerName);

  if (villages.length === 0) {
    await message.reply("No villages found for this player.");
    return;
  }

  const embed = buildPlayerEmbed(player, villages, serverKey);
  await message.reply({ embeds: [embed] });
}
