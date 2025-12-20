import { Client, Message, TextChannel, Colors, EmbedBuilder } from "discord.js";
import { getGuildConfig } from "../config/guild-config";
import { parseCoords } from "../utils/parse-coords";
import {
  reportTroopsSent,
  getRequestById,
  getRequestByCoords,
  addOrUpdateRequest,
  removeRequest,
  updateRequest,
} from "./defense-requests";
import { updateGlobalMessage, LastActionInfo } from "./defense-message";
import { getVillageAt, ensureMapData, getRallyPointLink, getTribeName } from "./map-data";

// Pattern: /sent or /stack (or !sent, !stack) followed by target and troops, optional user mention
// Simple format: /sent 1 200 or !sent 123|456 200 or !sent 123 -456 200 or !stack 1 200 @user
const SENT_PATTERN = /^[\/!](?:sent|stack)\s+(.+?)\s+(\d+)(?:\s+<@!?(\d+)>)?\s*$/i;
// Verbose format: /sent id: 1 troops: 200 or !sent target: 123|456 troops: 200 user: @user
const SENT_VERBOSE_PATTERN = /^[\/!](?:sent|stack)\s+(?:id|target):\s*(\S+)\s+troops:\s*(\d+)(?:\s+user:\s*<@!?(\d+)>)?\s*$/i;

// Pattern: /scout or !scout followed by coords and message
// Coords can be space-separated: !scout 51 -32 message here
const SCOUT_PATTERN = /^[\/!]scout\s+(\S+(?:\s+-?\d+)?)\s+(.+)$/i;
// Verbose format: /scout coords: 123|456 message: some text
const SCOUT_VERBOSE_PATTERN = /^[\/!]scout\s+coords:\s*(\S+)\s+message:\s*(.+)$/i;

// Pattern: /def or !def followed by coords, troops, and optional message
// Coords can be space-separated: !def 51 -32 5000 or !def 51|-32 5000 message
const DEF_PATTERN = /^[\/!]def\s+(.+?)\s+(\d+)(?:\s+(.+))?\s*$/i;

// Pattern: /deletedef or !deletedef followed by ID
const DELETEDEF_PATTERN = /^[\/!]deletedef\s+(\d+)\s*$/i;

// Pattern: /lookup or !lookup followed by coords (can be space-separated)
const LOOKUP_PATTERN = /^[\/!]lookup\s+(.+?)\s*$/i;

// Pattern: /stackinfo or !stackinfo (no parameters)
const STACKINFO_PATTERN = /^[\/!]stackinfo\s*$/i;

// Pattern: /updatedef or !updatedef followed by ID and optional params
// Format: !updatedef 1 troops_sent: 500 troops_needed: 2000 message: some text
const UPDATEDEF_PATTERN = /^[\/!]updatedef\s+(\d+)(?:\s+(.+))?$/i;

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

  const content = message.content.trim();

  // Lookup command works in any channel
  const lookupMatch = content.match(LOOKUP_PATTERN);
  if (lookupMatch) {
    await handleLookupCommand(client, message, lookupMatch[1]);
    return;
  }

  // Check if in defense or scout channel
  const isDefenseChannel = channelId === config.defenseChannelId;
  const isScoutChannel = channelId === config.scoutChannelId;

  if (!isDefenseChannel && !isScoutChannel) return;

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

    // Try deletedef command
    const deletedefMatch = content.match(DELETEDEF_PATTERN);
    if (deletedefMatch) {
      await handleDeleteDefCommand(client, message, parseInt(deletedefMatch[1], 10));
      return;
    }

    // Try stackinfo command
    const stackinfoMatch = content.match(STACKINFO_PATTERN);
    if (stackinfoMatch) {
      await handleStackinfoCommand(client, message);
      return;
    }

    // Try updatedef command (admin only)
    const updatedefMatch = content.match(UPDATEDEF_PATTERN);
    if (updatedefMatch) {
      await handleUpdateDefCommand(client, message, parseInt(updatedefMatch[1], 10), updatedefMatch[2] || "");
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

  // Get village info for the action message
  const village = await getVillageAt(config.serverKey, result.request.x, result.request.y);
  const villageName = village?.villageName || "Nežinomas";

  // Build last action info for global message
  let actionText: string;
  if (result.isComplete) {
    actionText = `<@${userId}> užbaigė **${villageName}** - **${result.request.troopsSent}/${result.request.troopsNeeded}**`;
  } else {
    actionText = `<@${userId}> išsiuntė **${troops}** į **${villageName}** - **${result.request.troopsSent}/${result.request.troopsNeeded}**`;
  }

  // Note: text commands don't have undo support yet, so we use 0 as placeholder
  const lastAction: LastActionInfo = {
    text: actionText,
    undoId: 0,
  };

  // Update global message with last action info
  await updateGlobalMessage(client, guildId, lastAction);

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

async function handleDeleteDefCommand(
  client: Client,
  message: Message,
  requestId: number
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  if (!config.serverKey || !config.defenseChannelId) return;

  // Check if request exists
  const existingRequest = getRequestById(guildId, requestId);
  if (!existingRequest) {
    await message.reply(`Užklausa #${requestId} nerasta.`);
    return;
  }

  // Get village info for confirmation message
  const village = await getVillageAt(config.serverKey, existingRequest.x, existingRequest.y);
  const villageName = village?.villageName || "Nežinomas";
  const playerName = village?.playerName || "Nežinomas";

  // Delete the request
  const success = removeRequest(guildId, requestId);
  if (!success) {
    await message.reply(`Nepavyko ištrinti užklausos #${requestId}.`);
    return;
  }

  // Update global message
  await updateGlobalMessage(client, guildId);

  // React to confirm
  await message.react("✅");

  await message.reply(
    `Ištrinta užklausa #${requestId}: **${villageName}** (${existingRequest.x}|${existingRequest.y}) - ${playerName}`
  );
}

async function handleLookupCommand(
  client: Client,
  message: Message,
  coordsInput: string
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  if (!config.serverKey) {
    await message.reply("Travian serveris nesukonfigūruotas.");
    return;
  }

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
      { name: "Aljansas", value: village.allianceName || "Nėra", inline: true },
      { name: "Siųsti karius", value: `[Susirinkimo taškas](${rallyLink})`, inline: false }
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleStackinfoCommand(
  client: Client,
  message: Message
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  if (!config.serverKey || !config.defenseChannelId) return;

  await updateGlobalMessage(client, guildId);

  // React to confirm
  await message.react("✅");
}

async function handleUpdateDefCommand(
  client: Client,
  message: Message,
  requestId: number,
  paramsStr: string
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  if (!config.serverKey || !config.defenseChannelId) return;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has("Administrator")) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  // Check if request exists
  const existingRequest = getRequestById(guildId, requestId);
  if (!existingRequest) {
    await message.reply(`Užklausa #${requestId} nerasta.`);
    return;
  }

  // Parse parameters: troops_sent: 500 troops_needed: 2000 message: some text
  const updates: { troopsSent?: number; troopsNeeded?: number; message?: string } = {};

  const troopsSentMatch = paramsStr.match(/troops_sent:\s*(\d+)/i);
  if (troopsSentMatch) {
    updates.troopsSent = parseInt(troopsSentMatch[1], 10);
  }

  const troopsNeededMatch = paramsStr.match(/troops_needed:\s*(\d+)/i);
  if (troopsNeededMatch) {
    updates.troopsNeeded = parseInt(troopsNeededMatch[1], 10);
  }

  const messageMatch = paramsStr.match(/message:\s*(.+?)(?:\s+(?:troops_sent|troops_needed):|$)/i);
  if (messageMatch) {
    updates.message = messageMatch[1].trim();
  }

  if (Object.keys(updates).length === 0) {
    await message.reply("Nurodyk bent vieną lauką atnaujinti (troops_sent: X, troops_needed: X arba message: tekstas).");
    return;
  }

  // Update the request
  const result = updateRequest(guildId, requestId, updates);

  if ("error" in result) {
    await message.reply(result.error);
    return;
  }

  // Update global message
  await updateGlobalMessage(client, guildId);

  // React to confirm
  await message.react("✅");

  const updatedFields: string[] = [];
  if (updates.troopsSent !== undefined) updatedFields.push(`išsiųsta karių: ${updates.troopsSent}`);
  if (updates.troopsNeeded !== undefined) updatedFields.push(`reikia karių: ${updates.troopsNeeded}`);
  if (updates.message !== undefined) updatedFields.push(`žinutė: "${updates.message}"`);

  await message.reply(`Užklausa #${requestId} atnaujinta: ${updatedFields.join(", ")}`);
}
