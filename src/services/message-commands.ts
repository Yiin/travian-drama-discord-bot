import { Client, Message, TextChannel, Colors, EmbedBuilder } from "discord.js";
import { getGuildConfig } from "../config/guild-config";
import { parseCoords } from "../utils/parse-coords";
import {
  reportTroopsSent,
  getRequestById,
  getRequestByCoords,
  addOrUpdateRequest,
} from "./defense-requests";
import { updateGlobalMessage, sendTroopNotification } from "./defense-message";
import { getVillageAt, ensureMapData, getRallyPointLink } from "./map-data";

// Pattern: /sent or /stack (or !sent, !stack) followed by target and troops, optional user mention
// Simple format: /sent 1 200 or !sent 123|456 200 or !stack 1 200 @user
const SENT_PATTERN = /^[\/!](?:sent|stack)\s+(\S+)\s+(\d+)(?:\s+<@!?(\d+)>)?\s*$/i;
// Verbose format: /sent id: 1 troops: 200 or !sent target: 123|456 troops: 200 user: @user
const SENT_VERBOSE_PATTERN = /^[\/!](?:sent|stack)\s+(?:id|target):\s*(\S+)\s+troops:\s*(\d+)(?:\s+user:\s*<@!?(\d+)>)?\s*$/i;

// Pattern: /scout or !scout followed by coords and message
const SCOUT_PATTERN = /^[\/!]scout\s+(\S+)\s+(.+)$/i;
// Verbose format: /scout coords: 123|456 message: some text
const SCOUT_VERBOSE_PATTERN = /^[\/!]scout\s+coords:\s*(\S+)\s+message:\s*(.+)$/i;

// Pattern: /def or !def followed by coords, troops, and optional message
// Simple format: !def 123|456 2000 or !def (61|-145) 2000 optional message here
const DEF_PATTERN = /^[\/!]def\s+(\S+)\s+(\d+)(?:\s+(.+))?$/i;

/**
 * Handle text messages that look like slash commands (e.g., "/sent id: 1 troops: 200")
 * Works for both new messages and edited messages
 */
export async function handleTextCommand(
  client: Client,
  message: Message
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

  // Must be in a guild
  const guildId = message.guildId;
  if (!guildId) return;

  const config = getGuildConfig(guildId);
  const channelId = message.channelId;

  // Check if in defense or scout channel
  const isDefenseChannel = channelId === config.defenseChannelId;
  const isScoutChannel = channelId === config.scoutChannelId;

  if (!isDefenseChannel && !isScoutChannel) return;

  const content = message.content.trim();

  // Try sent/stack or def command in defense channel
  if (isDefenseChannel) {
    // Try simple format first, then verbose format
    const sentMatch = content.match(SENT_PATTERN) || content.match(SENT_VERBOSE_PATTERN);
    if (sentMatch) {
      const forUserId = sentMatch[3]; // Optional user mention
      await handleSentCommand(client, message, sentMatch[1], parseInt(sentMatch[2], 10), forUserId);
      return;
    }

    // Try def command
    const defMatch = content.match(DEF_PATTERN);
    if (defMatch) {
      await handleDefCommand(client, message, defMatch[1], parseInt(defMatch[2], 10), defMatch[3] || "");
      return;
    }
  }

  // Try scout command in scout channel
  if (isScoutChannel) {
    // Try simple format first, then verbose format
    const scoutMatch = content.match(SCOUT_PATTERN) || content.match(SCOUT_VERBOSE_PATTERN);
    if (scoutMatch) {
      await handleScoutCommand(client, message, scoutMatch[1], scoutMatch[2]);
      return;
    }
  }
}

/**
 * @deprecated Use handleTextCommand instead
 */
export async function handleMessageEdit(
  client: Client,
  oldMessage: Message | null,
  newMessage: Message
): Promise<void> {
  await handleTextCommand(client, newMessage);
}

async function handleSentCommand(
  client: Client,
  message: Message,
  targetInput: string,
  troops: number,
  forUserId?: string
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);
  const userId = forUserId || message.author.id;

  if (!config.serverKey) return;

  // Parse target as coords or ID
  let requestId: number;
  const coords = parseCoords(targetInput);
  if (coords) {
    const found = getRequestByCoords(guildId, coords.x, coords.y);
    if (!found) {
      await message.reply(`Nerasta aktyvi užklausa koordinatėse (${coords.x}|${coords.y}).`);
      return;
    }
    requestId = found.requestId;
  } else {
    const parsed = parseInt(targetInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      await message.reply("Neteisingas tikslas. Naudok užklausos ID (pvz., 1) arba koordinates (pvz., 123|456).");
      return;
    }
    requestId = parsed;
    const existingRequest = getRequestById(guildId, requestId);
    if (!existingRequest) {
      await message.reply(`Užklausa #${requestId} nerasta.`);
      return;
    }
  }

  if (troops < 1) {
    await message.reply("Karių skaičius turi būti bent 1.");
    return;
  }

  // Report troops
  const result = reportTroopsSent(guildId, requestId, userId, troops);

  if ("error" in result) {
    await message.reply(result.error);
    return;
  }

  // Send notification
  await sendTroopNotification(
    client,
    guildId,
    userId,
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

async function handleDefCommand(
  client: Client,
  message: Message,
  coordsInput: string,
  troops: number,
  defMessage: string
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  if (!config.serverKey || !config.defenseChannelId) return;

  const coords = parseCoords(coordsInput);
  if (!coords) {
    await message.reply("Neteisingos koordinatės. Naudok formatą 123|456.");
    return;
  }

  if (troops < 1) {
    await message.reply("Karių skaičius turi būti bent 1.");
    return;
  }

  // Ensure map data
  const dataReady = await ensureMapData(config.serverKey);
  if (!dataReady) {
    await message.reply("Nepavyko užkrauti žemėlapio duomenų.");
    return;
  }

  const village = await getVillageAt(config.serverKey, coords.x, coords.y);
  if (!village) {
    await message.reply(`Arba to kaimo nėra arba jis ką tik įkurtas (${coords.x}|${coords.y}).`);
    return;
  }

  // Add or update the request
  const result = addOrUpdateRequest(
    guildId,
    coords.x,
    coords.y,
    troops,
    defMessage,
    message.author.id
  );

  if ("error" in result) {
    await message.reply(result.error);
    return;
  }

  // Update global message
  await updateGlobalMessage(client, guildId);

  // React to confirm
  await message.react("✅");

  const actionText = result.isUpdate ? "atnaujinta" : "sukurta";
  const playerInfo = village.allianceName
    ? `${village.playerName} [${village.allianceName}]`
    : village.playerName;
  await message.reply(
    `Gynybos užklausa #${result.requestId} ${actionText}: **${village.villageName}** (${coords.x}|${coords.y}) - ${playerInfo} - reikia ${troops} karių.`
  );
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
    await message.reply("Neteisingos koordinatės. Naudok formatą 123|456.");
    return;
  }

  // Ensure map data
  const dataReady = await ensureMapData(config.serverKey);
  if (!dataReady) {
    await message.reply("Nepavyko užkrauti žemėlapio duomenų.");
    return;
  }

  const village = await getVillageAt(config.serverKey, coords.x, coords.y);
  if (!village) {
    await message.reply(`Kaimas koordinatėse (${coords.x}|${coords.y}) nerastas.`);
    return;
  }

  const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId);

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setDescription(
      `(${coords.x}|${coords.y}) **${village.villageName}** (${village.playerName}) [**[ SIŲSTI ]**](${rallyLink}) - ${scoutMessage}`
    )
    .setFooter({ text: `Paprašė ${message.author.displayName}` });

  const channel = (await client.channels.fetch(config.scoutChannelId)) as TextChannel | null;
  if (channel) {
    await channel.send({ embeds: [embed] });
  }

  // React to confirm
  await message.react("✅");
}
