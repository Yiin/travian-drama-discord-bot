import { Client, Message, TextChannel, Colors, EmbedBuilder } from "discord.js";
import { getGuildConfig } from "../config/guild-config";
import { parseCoords } from "../utils/parse-coords";
import {
  reportTroopsSent,
  getRequestById,
  getRequestByCoords,
} from "./defense-requests";
import { updateGlobalMessage, sendTroopNotification } from "./defense-message";
import { getVillageAt, ensureMapData, getRallyPointLink } from "./map-data";

// Pattern: /sent or /stack followed by target and troops
const SENT_PATTERN = /^\/(?:sent|stack)\s+(\S+)\s+(\d+)\s*$/i;
// Pattern: /scout followed by coords and message
const SCOUT_PATTERN = /^\/scout\s+(\S+)\s+(.+)$/i;

export async function handleMessageEdit(
  client: Client,
  oldMessage: Message | null,
  newMessage: Message
): Promise<void> {
  // Ignore bot messages
  if (newMessage.author.bot) return;

  // Must be in a guild
  const guildId = newMessage.guildId;
  if (!guildId) return;

  const config = getGuildConfig(guildId);
  const channelId = newMessage.channelId;

  // Check if in defense or scout channel
  const isDefenseChannel = channelId === config.defenseChannelId;
  const isScoutChannel = channelId === config.scoutChannelId;

  if (!isDefenseChannel && !isScoutChannel) return;

  const content = newMessage.content.trim();

  // Try sent/stack command in defense channel
  if (isDefenseChannel) {
    const sentMatch = content.match(SENT_PATTERN);
    if (sentMatch) {
      await handleSentCommand(client, newMessage, sentMatch[1], parseInt(sentMatch[2], 10));
      return;
    }
  }

  // Try scout command in scout channel
  if (isScoutChannel) {
    const scoutMatch = content.match(SCOUT_PATTERN);
    if (scoutMatch) {
      await handleScoutCommand(client, newMessage, scoutMatch[1], scoutMatch[2]);
      return;
    }
  }
}

async function handleSentCommand(
  client: Client,
  message: Message,
  targetInput: string,
  troops: number
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  if (!config.serverKey) return;

  // Parse target as coords or ID
  let requestId: number;
  const coords = parseCoords(targetInput);
  if (coords) {
    const found = getRequestByCoords(guildId, coords.x, coords.y);
    if (!found) {
      await message.reply(`No active request found at (${coords.x}|${coords.y}).`);
      return;
    }
    requestId = found.requestId;
  } else {
    const parsed = parseInt(targetInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      await message.reply("Invalid target. Use request ID (e.g., 1) or coordinates (e.g., 123|456).");
      return;
    }
    requestId = parsed;
    const existingRequest = getRequestById(guildId, requestId);
    if (!existingRequest) {
      await message.reply(`Request #${requestId} not found.`);
      return;
    }
  }

  if (troops < 1) {
    await message.reply("Troops must be at least 1.");
    return;
  }

  // Report troops
  const result = reportTroopsSent(guildId, requestId, message.author.id, troops);

  if ("error" in result) {
    await message.reply(result.error);
    return;
  }

  // Send notification
  await sendTroopNotification(
    client,
    guildId,
    message.author.id,
    troops,
    result.request,
    result.isComplete,
    requestId
  );

  // Update global message
  await updateGlobalMessage(client, guildId);

  // React to confirm
  await message.react("✅");
}

async function handleScoutCommand(
  client: Client,
  message: Message,
  coordsInput: string,
  scoutMessage: string
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  if (!config.serverKey || !config.scoutChannelId) return;

  const coords = parseCoords(coordsInput);
  if (!coords) {
    await message.reply("Invalid coordinates. Use format like 123|456.");
    return;
  }

  // Ensure map data
  const dataReady = await ensureMapData(config.serverKey);
  if (!dataReady) {
    await message.reply("Failed to load map data.");
    return;
  }

  const village = await getVillageAt(config.serverKey, coords.x, coords.y);
  if (!village) {
    await message.reply(`No village found at (${coords.x}|${coords.y}).`);
    return;
  }

  const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId);

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setDescription(
      `(${coords.x}|${coords.y}) **${village.villageName}** (${village.playerName}) [[SEND]](${rallyLink}) - ${scoutMessage}`
    )
    .setFooter({ text: `Requested by ${message.author.displayName}` });

  const channel = (await client.channels.fetch(config.scoutChannelId)) as TextChannel | null;
  if (channel) {
    await channel.send({ embeds: [embed] });
  }

  // React to confirm
  await message.react("✅");
}
