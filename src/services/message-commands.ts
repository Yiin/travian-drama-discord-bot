import { Client, Message, TextChannel, Colors, EmbedBuilder } from "discord.js";
import { getGuildConfig } from "../config/guild-config";
import { parseCoords } from "../utils/parse-coords";
import { getRequestById } from "./defense-requests";
import { getVillageAt, ensureMapData, getRallyPointLink, getTribeName, formatVillageDisplay } from "./map-data";
import { updateGlobalMessage } from "./defense-message";
import {
  validateDefenseConfig,
  executeSentAction,
  executeDefAction,
  executeDeleteDefAction,
  executeUpdateDefAction,
  executeUndoAction,
  executeScoutAction,
  sendScoutMessage,
} from "../actions";

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

// Pattern: /undo or !undo followed by action ID
const UNDO_PATTERN = /^[\/!]undo\s+(\d+)\s*$/i;

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

    // Try undo command
    const undoMatch = content.match(UNDO_PATTERN);
    if (undoMatch) {
      await handleUndoCommand(client, message, parseInt(undoMatch[1], 10));
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

  // 1. Validate configuration
  const validation = validateDefenseConfig(guildId);
  if (!validation.valid) {
    // For text commands, silently ignore if config is missing
    return;
  }

  // 2. Validate troops
  if (troops < 1) {
    await message.reply("Karių skaičius turi būti bent 1.");
    return;
  }

  // 3. Execute action (text commands now get undo support!)
  const creditUserId = forUserId || message.author.id;
  const result = await executeSentAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client,
      userId: message.author.id,
    },
    {
      target: targetInput,
      troops,
      creditUserId,
    }
  );

  // 4. Handle response
  if (!result.success) {
    await message.reply(result.error);
    return;
  }

  // Success: react with checkmark
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

  // 1. Validate configuration
  const validation = validateDefenseConfig(guildId);
  if (!validation.valid) {
    // For text commands, silently ignore if config is missing
    return;
  }

  // 2. Validate troops
  if (troops < 1) {
    await message.reply("Karių skaičius turi būti bent 1.");
    return;
  }

  // 3. Execute action (text commands now get undo support!)
  const result = await executeDefAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client,
      userId: message.author.id,
    },
    {
      coords: coordsInput,
      troopsNeeded: troops,
      message: defMessage,
    }
  );

  // 4. Handle response
  if (!result.success) {
    await message.reply(result.error);
    return;
  }

  // Success: react and reply with confirmation
  await message.react("✅");
  await message.reply(result.actionText);
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

  // Execute the scout action
  const result = await executeScoutAction(
    {
      guildId,
      config,
      client,
      userId: message.author.id,
    },
    {
      coords: coordsInput,
      message: scoutMessage,
      requesterId: message.author.id,
      scoutRoleId: config.scoutRoleId,
    }
  );

  if (!result.success) {
    await message.reply(result.error);
    return;
  }

  // Send the scout message to the channel
  const sent = await sendScoutMessage(client, config.scoutChannelId, {
    ...result,
    message: scoutMessage,
    requesterId: message.author.id,
    scoutRoleId: config.scoutRoleId,
  });

  if (!sent) {
    await message.reply("Sukonfigūruotas žvalgybos kanalas nerastas.");
    return;
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

  // 1. Validate configuration
  const validation = validateDefenseConfig(guildId);
  if (!validation.valid) {
    // For text commands, silently ignore if config is missing
    return;
  }

  // 2. Execute action (text commands now get undo support!)
  const result = await executeDeleteDefAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client,
      userId: message.author.id,
    },
    { requestId }
  );

  // 3. Handle response
  if (!result.success) {
    await message.reply(result.error);
    return;
  }

  // Success: react and reply with confirmation
  await message.react("✅");
  await message.reply(result.actionText);
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

  // 1. Validate configuration
  const validation = validateDefenseConfig(guildId);
  if (!validation.valid) {
    // For text commands, silently ignore if config is missing
    return;
  }

  // 2. Check admin permission
  const member = message.member;
  if (!member?.permissions.has("Administrator")) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  // 3. Parse parameters: troops_sent: 500 troops_needed: 2000 message: some text
  let troopsSent: number | undefined;
  let troopsNeeded: number | undefined;
  let updateMessage: string | undefined;

  const troopsSentMatch = paramsStr.match(/troops_sent:\s*(\d+)/i);
  if (troopsSentMatch) {
    troopsSent = parseInt(troopsSentMatch[1], 10);
  }

  const troopsNeededMatch = paramsStr.match(/troops_needed:\s*(\d+)/i);
  if (troopsNeededMatch) {
    troopsNeeded = parseInt(troopsNeededMatch[1], 10);
  }

  const messageMatch = paramsStr.match(/message:\s*(.+?)(?:\s+(?:troops_sent|troops_needed):|$)/i);
  if (messageMatch) {
    updateMessage = messageMatch[1].trim();
  }

  if (troopsSent === undefined && troopsNeeded === undefined && updateMessage === undefined) {
    await message.reply("Nurodyk bent vieną lauką atnaujinti (troops_sent: X, troops_needed: X arba message: tekstas).");
    return;
  }

  // 4. Execute action (text commands now get undo support!)
  const result = await executeUpdateDefAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client,
      userId: message.author.id,
    },
    {
      requestId,
      troopsSent,
      troopsNeeded,
      message: updateMessage,
    }
  );

  // 5. Handle response
  if (!result.success) {
    await message.reply(result.error);
    return;
  }

  // Success: react and reply with confirmation
  await message.react("✅");
  await message.reply(result.actionText);
}

async function handleUndoCommand(
  client: Client,
  message: Message,
  actionId: number
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  // Undo only needs defenseChannelId
  if (!config.defenseChannelId) return;

  // Execute action
  const result = await executeUndoAction(
    {
      guildId,
      config,
      client,
      userId: message.author.id,
    },
    { actionId }
  );

  // Handle response
  if (!result.success) {
    await message.reply(result.error);
    return;
  }

  // Success: react and reply with confirmation
  await message.react("✅");
  await message.reply(result.actionText);
}
