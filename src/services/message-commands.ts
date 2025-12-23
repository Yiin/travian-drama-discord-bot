import { Client, Message, TextChannel, Colors, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { getGuildConfig, setServerKey, setDefenseChannel, setScoutChannel, setScoutRole } from "../config/guild-config";
import { parseCoords } from "../utils/parse-coords";
import { getRequestById } from "./defense-requests";
import { getVillageAt, ensureMapData, getRallyPointLink, getTribeName, formatVillageDisplay, searchPlayersByName, getVillagesByPlayerName, getMapLink, updateMapData, getPlayerByExactName, PlayerSearchResult } from "./map-data";
import { updateGlobalMessage } from "./defense-message";
import { getPlayerHistoryByName, formatPopulationTrend } from "./population-history";
import { getLeaderboard, getUserStats, getVillageStats, getAllVillageStats, resetStats, getLastResetTime, recordContribution } from "./stats";
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

// Pattern: /drama or !drama with optional language (en/lt)
const DRAMA_PATTERN = /^[\/!]drama(?:\s+(en|lt))?\s*$/i;

// Pattern: /configure or !configure with subcommands
// !configure server ts31.x3.europe
// !configure channel defense #channel (or channel ID)
// !configure channel scout #channel
// !configure scoutrole @role (or role ID, or "clear")
const CONFIGURE_SERVER_PATTERN = /^[\/!]configure\s+server\s+(\S+)\s*$/i;
const CONFIGURE_CHANNEL_PATTERN = /^[\/!]configure\s+channel\s+(defense|scout)\s+(?:<#)?(\d+)>?\s*$/i;
const CONFIGURE_SCOUTROLE_PATTERN = /^[\/!]configure\s+scoutrole(?:\s+(?:(?:<@&)?(\d+)>?|(clear)))?\s*$/i;

// Pattern: /stats or !stats with subcommands
// !stats leaderboard
// !stats user @user
// !stats player PlayerName
// !stats village 123|456
// !stats stacks
// !stats reset
const STATS_LEADERBOARD_PATTERN = /^[\/!]stats\s+leaderboard\s*$/i;
const STATS_USER_PATTERN = /^[\/!]stats\s+user\s+<@!?(\d+)>\s*$/i;
const STATS_PLAYER_PATTERN = /^[\/!]stats\s+player\s+(.+?)\s*$/i;
const STATS_VILLAGE_PATTERN = /^[\/!]stats\s+village\s+(.+?)\s*$/i;
const STATS_STACKS_PATTERN = /^[\/!]stats\s+stacks\s*$/i;
const STATS_RESET_PATTERN = /^[\/!]stats\s+reset\s*$/i;

// Pattern: /addstat or !addstat followed by coords, troops (can be negative), and optional user mention
// !addstat 123|456 5000 or !addstat 123 -456 -500 @user
const ADDSTAT_PATTERN = /^[\/!]addstat\s+(.+?)\s+(-?\d+)(?:\s+<@!?(\d+)>)?\s*$/i;

/**
 * Handle text messages that look like slash commands (e.g., "/sent id: 1 troops: 200")
 * Works for both new messages and edited messages
 * Supports multiple commands per message, one per line
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

  // Split message into lines and process each as a potential command
  const lines = message.content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  for (const content of lines) {
    // Process each line as a separate command
    await processSingleCommand(client, message, content, config, channelId);
  }
}

/**
 * Process a single command line
 */
async function processSingleCommand(
  client: Client,
  message: Message,
  content: string,
  config: ReturnType<typeof getGuildConfig>,
  channelId: string
): Promise<void> {
  // Lookup command works in any channel
  const lookupMatch = content.match(LOOKUP_PATTERN);
  if (lookupMatch) {
    await handleLookupCommand(client, message, lookupMatch[1]);
    return;
  }

  // Drama command works in any channel
  const dramaMatch = content.match(DRAMA_PATTERN);
  if (dramaMatch) {
    await handleDramaCommand(client, message, dramaMatch[1] as "en" | "lt" | undefined);
    return;
  }

  // Configure commands work in any channel (admin only)
  const configServerMatch = content.match(CONFIGURE_SERVER_PATTERN);
  if (configServerMatch) {
    await handleConfigureServerCommand(client, message, configServerMatch[1]);
    return;
  }

  const configChannelMatch = content.match(CONFIGURE_CHANNEL_PATTERN);
  if (configChannelMatch) {
    await handleConfigureChannelCommand(client, message, configChannelMatch[1] as "defense" | "scout", configChannelMatch[2]);
    return;
  }

  const configScoutRoleMatch = content.match(CONFIGURE_SCOUTROLE_PATTERN);
  if (configScoutRoleMatch) {
    await handleConfigureScoutRoleCommand(client, message, configScoutRoleMatch[1], configScoutRoleMatch[2]);
    return;
  }

  // Stats commands work in any channel (admin only)
  const statsLeaderboardMatch = content.match(STATS_LEADERBOARD_PATTERN);
  if (statsLeaderboardMatch) {
    await handleStatsLeaderboardCommand(client, message);
    return;
  }

  const statsUserMatch = content.match(STATS_USER_PATTERN);
  if (statsUserMatch) {
    await handleStatsUserCommand(client, message, statsUserMatch[1]);
    return;
  }

  const statsPlayerMatch = content.match(STATS_PLAYER_PATTERN);
  if (statsPlayerMatch) {
    await handleStatsPlayerCommand(client, message, statsPlayerMatch[1]);
    return;
  }

  const statsVillageMatch = content.match(STATS_VILLAGE_PATTERN);
  if (statsVillageMatch) {
    await handleStatsVillageCommand(client, message, statsVillageMatch[1]);
    return;
  }

  const statsStacksMatch = content.match(STATS_STACKS_PATTERN);
  if (statsStacksMatch) {
    await handleStatsStacksCommand(client, message);
    return;
  }

  const statsResetMatch = content.match(STATS_RESET_PATTERN);
  if (statsResetMatch) {
    await handleStatsResetCommand(client, message);
    return;
  }

  // Addstat command works in any channel
  const addstatMatch = content.match(ADDSTAT_PATTERN);
  if (addstatMatch) {
    const forUserId = addstatMatch[3]; // Optional user mention
    await handleAddstatCommand(client, message, addstatMatch[1], parseInt(addstatMatch[2], 10), forUserId);
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
    requesterName: message.author.displayName,
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
  queryInput: string
): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);

  if (!config.serverKey) {
    await message.reply("Travian serveris nesukonfigūruotas.");
    return;
  }

  // Try parsing as coordinates first
  const coords = parseCoords(queryInput);

  if (coords) {
    await handleCoordinateLookup(message, config.serverKey, coords);
  } else {
    await handlePlayerLookup(message, config.serverKey, queryInput);
  }
}

async function handleCoordinateLookup(
  message: Message,
  serverKey: string,
  coords: { x: number; y: number }
): Promise<void> {
  // Ensure map data
  const dataReady = await ensureMapData(serverKey);
  if (!dataReady) {
    await message.reply("Nepavyko užkrauti žemėlapio duomenų.");
    return;
  }

  const village = await getVillageAt(serverKey, coords.x, coords.y);
  if (!village) {
    await message.reply(`Kaimas koordinatėse (${coords.x}|${coords.y}) nerastas.`);
    return;
  }

  const rallyLink = getRallyPointLink(serverKey, village.targetMapId, 1);
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

async function handlePlayerLookup(
  message: Message,
  serverKey: string,
  playerName: string
): Promise<void> {
  const dataReady = await ensureMapData(serverKey);
  if (!dataReady) {
    await message.reply("Nepavyko užkrauti žemėlapio duomenų.");
    return;
  }

  // Search for matching players
  const matchingPlayers = await searchPlayersByName(serverKey, playerName, 25);

  if (matchingPlayers.length === 0) {
    await message.reply(`Žaidėjas "${playerName}" nerastas.`);
    return;
  }

  if (matchingPlayers.length === 1) {
    // Single match - show full details
    await showPlayerDetailsMessage(message, serverKey, matchingPlayers[0]);
    return;
  }

  // Multiple matches - show list with instructions
  const playerList = matchingPlayers.slice(0, 10).map((p, i) =>
    `${i + 1}. **${p.playerName}** - ${p.totalPopulation.toLocaleString()} pop, ${p.villageCount} kaimai`
  ).join("\n");

  const moreText = matchingPlayers.length > 10
    ? `\n... ir dar ${matchingPlayers.length - 10} žaidėjų`
    : "";

  await message.reply(
    `Rasta ${matchingPlayers.length} žaidėjų su vardu "${playerName}":\n\n${playerList}${moreText}\n\nPatikslinkite paiešką, kad gautumėte tikslų rezultatą.`
  );
}

async function showPlayerDetailsMessage(
  message: Message,
  serverKey: string,
  player: PlayerSearchResult
): Promise<void> {
  // Get all villages for this player by name
  const villages = await getVillagesByPlayerName(serverKey, player.playerName);

  if (villages.length === 0) {
    await message.reply("Žaidėjo kaimų nerasta.");
    return;
  }

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

// ============================================
// Drama command handler
// ============================================

interface CommandDoc {
  name: string;
  description: { lt: string; en: string };
  usage: string;
  example: string;
  adminOnly?: boolean;
}

const commandDocs: CommandDoc[] = [
  // Defense commands
  {
    name: "/def",
    description: {
      lt: "Sukurti arba atnaujinti gynybos prašymą",
      en: "Create or update a defense request",
    },
    usage: "/def coords:<koordinatės> troops:<skaičius> [message:<žinutė>]",
    example: "/def coords:123|456 troops:5000 message:Ateina hammeris",
  },
  {
    name: "/sent",
    description: {
      lt: "Pranešti apie išsiųstus karius į gynybos prašymą",
      en: "Report troops sent to a defense request",
    },
    usage: "/sent target:<ID arba koordinatės> troops:<skaičius> [user:<vartotojas>]",
    example: "/sent target:1 troops:2000",
  },
  {
    name: "/stack",
    description: {
      lt: "Tas pats kaip /sent - pranešti apie išsiųstus karius",
      en: "Same as /sent - report troops sent to a defense request",
    },
    usage: "/stack target:<ID arba koordinatės> troops:<skaičius> [user:<vartotojas>]",
    example: "/stack target:123|456 troops:1500",
  },
  {
    name: "/deletedef",
    description: {
      lt: "Ištrinti gynybos prašymą",
      en: "Delete a defense request",
    },
    usage: "/deletedef id:<numeris>",
    example: "/deletedef id:3",
  },
  {
    name: "/updatedef",
    description: {
      lt: "Atnaujinti gynybos prašymą",
      en: "Update a defense request",
    },
    usage: "/updatedef id:<numeris> [troops_sent:<skaičius>] [troops_needed:<skaičius>] [message:<žinutė>]",
    example: "/updatedef id:1 troops_sent:3000 troops_needed:6000",
  },
  {
    name: "/undo",
    description: {
      lt: "Atšaukti ankstesnį veiksmą",
      en: "Undo a previous action",
    },
    usage: "/undo id:<veiksmo ID>",
    example: "/undo id:5",
  },
  {
    name: "/stackinfo",
    description: {
      lt: "Iš naujo paskelbti gynybos užklausų sąrašą",
      en: "Re-post the defense request list",
    },
    usage: "/stackinfo",
    example: "/stackinfo",
  },

  // Scout commands
  {
    name: "/scout",
    description: {
      lt: "Išsiųsti žvalgybos prašymą",
      en: "Send a scouting request",
    },
    usage: "/scout coords:<koordinatės> message:<žinutė>",
    example: "/scout coords:-50|120 message:WWK ar fake?",
  },

  // Lookup command
  {
    name: "/lookup",
    description: {
      lt: "Ieškoti kaimo arba žaidėjo informacijos",
      en: "Look up village or player information",
    },
    usage: "/lookup query:<koordinatės arba vardas>",
    example: "/lookup query:PlayerName",
  },

  // Addstat command
  {
    name: "/addstat",
    description: {
      lt: "Pridėti karių siuntimą į statistiką (be gynybos prašymo)",
      en: "Add troops sent to stats (without defense request)",
    },
    usage: "/addstat coords:<koordinatės> troops:<skaičius>",
    example: "!addstat 123|456 5000",
  },

  // Stats commands
  {
    name: "/stats leaderboard",
    description: {
      lt: "Rodyti vartotojų reitingą pagal išsiųstus karius",
      en: "Show users ranked by total troops sent",
    },
    usage: "/stats leaderboard",
    example: "/stats leaderboard",
    adminOnly: true,
  },
  {
    name: "/stats user",
    description: {
      lt: "Rodyti konkretaus vartotojo statistiką",
      en: "Show stats for a specific user",
    },
    usage: "/stats user @vartotojas",
    example: "!stats user @Jonas",
    adminOnly: true,
  },
  {
    name: "/stats player",
    description: {
      lt: "Rodyti Travian žaidėjo kaimų statistiką",
      en: "Show stats for villages owned by a Travian player",
    },
    usage: "/stats player <vardas>",
    example: "!stats player PlayerName",
    adminOnly: true,
  },
  {
    name: "/stats village",
    description: {
      lt: "Rodyti konkretaus kaimo statistiką",
      en: "Show stats for a specific village",
    },
    usage: "/stats village <koordinatės>",
    example: "!stats village 123|456",
    adminOnly: true,
  },
  {
    name: "/stats stacks",
    description: {
      lt: "Rodyti kaimus pagal surinktą gynybą",
      en: "Show villages ranked by total defense collected",
    },
    usage: "/stats stacks",
    example: "!stats stacks",
    adminOnly: true,
  },

  // Configuration commands
  {
    name: "/configure server",
    description: {
      lt: "Nustatyti Travian serverį žemėlapio paieškai",
      en: "Configure the Travian gameworld for map lookups",
    },
    usage: "/configure server value:<serverio raktas>",
    example: "/configure server value:ts31.x3.europe",
    adminOnly: true,
  },
  {
    name: "/configure channel",
    description: {
      lt: "Nustatyti gynybos arba žvalgybos kanalą",
      en: "Configure defense or scout request channels",
    },
    usage: "/configure channel type:<Defense|Scout> value:<kanalas>",
    example: "/configure channel type:Defense value:#gynybos-kanalas",
    adminOnly: true,
  },
  {
    name: "/configure scoutrole",
    description: {
      lt: "Nustatyti arba išvalyti rolę, kuri bus paminėta žvalgybos prašymuose",
      en: "Set or clear the role to mention for scout requests",
    },
    usage: "/configure scoutrole [role:<rolė>]",
    example: "/configure scoutrole role:@Žvalgai",
    adminOnly: true,
  },
];

function buildDramaEmbed(lang: "lt" | "en"): EmbedBuilder {
  const isLt = lang === "lt";

  const embed = new EmbedBuilder()
    .setTitle(isLt ? "Drama Bot Komandos" : "Drama Bot Commands")
    .setColor(Colors.Blue)
    .setDescription(
      isLt
        ? "Drama: Travian gynybos ir žvalgybos koordinavimo botas\n\n**Visos komandos veikia su `/` arba `!`** (pvz., `/def` = `!def`)"
        : "Drama: Travian defense and scout coordination bot\n\n**All commands work with `/` or `!`** (e.g., `/def` = `!def`)"
    );

  // Group commands by category
  const defenseCommands = commandDocs.filter((c) =>
    ["/def", "/sent", "/stack", "/deletedef", "/updatedef", "/undo", "/stackinfo"].includes(c.name)
  );
  const scoutCommands = commandDocs.filter((c) => c.name === "/scout");
  const utilityCommands = commandDocs.filter((c) => c.name === "/lookup" || c.name === "/addstat");
  const statsCommands = commandDocs.filter((c) => c.name.startsWith("/stats"));
  const configCommands = commandDocs.filter((c) => c.name.startsWith("/configure"));

  // Defense section
  const defenseSection = defenseCommands
    .map((cmd) => {
      const adminTag = cmd.adminOnly ? (isLt ? " *(Admin)*" : " *(Admin)*") : "";
      return `**${cmd.name}**${adminTag}\n${cmd.description[lang]}\n\`${cmd.example}\``;
    })
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Gynybos komandos" : "Defense Commands",
    value: defenseSection,
  });

  // Scout section
  const scoutSection = scoutCommands
    .map((cmd) => `**${cmd.name}**\n${cmd.description[lang]}\n\`${cmd.example}\``)
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Žvalgybos komandos" : "Scout Commands",
    value: scoutSection,
  });

  // Utility section
  const utilitySection = utilityCommands
    .map((cmd) => `**${cmd.name}**\n${cmd.description[lang]}\n\`${cmd.example}\``)
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Pagalbinės komandos" : "Utility Commands",
    value: utilitySection,
  });

  // Stats section
  const statsSection = statsCommands
    .map((cmd) => {
      const adminTag = cmd.adminOnly ? " *(Admin)*" : "";
      return `**${cmd.name}**${adminTag}\n${cmd.description[lang]}\n\`${cmd.example}\``;
    })
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Statistikos komandos" : "Stats Commands",
    value: statsSection,
  });

  // Configuration section
  const configSection = configCommands
    .map((cmd) => {
      const adminTag = cmd.adminOnly ? " *(Admin)*" : "";
      return `**${cmd.name}**${adminTag}\n${cmd.description[lang]}\n\`${cmd.example}\``;
    })
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Konfigūracijos komandos" : "Configuration Commands",
    value: configSection,
  });

  // Footer with language hint
  if (isLt) {
    embed.setFooter({
      text: "For English version: /drama en"
    });
  }

  return embed;
}

async function handleDramaCommand(
  client: Client,
  message: Message,
  lang?: "en" | "lt"
): Promise<void> {
  const embed = buildDramaEmbed(lang || "lt");
  await message.reply({ embeds: [embed] });
}

// ============================================
// Configure command handlers
// ============================================

function normalizeServerKey(input: string): string {
  let key = input.trim().toLowerCase();

  // Remove protocol if present
  key = key.replace(/^https?:\/\//, "");

  // Remove .travian.com suffix if present
  key = key.replace(/\.travian\.com\/?$/, "");

  // Remove trailing slash
  key = key.replace(/\/+$/, "");

  return key;
}

function isValidServerKey(key: string): boolean {
  // Should be like: ts31.x3.europe or ts5.x1.international
  // Basic validation: should have dots, no spaces, alphanumeric with dots
  return /^[a-z0-9]+(\.[a-z0-9]+)+$/.test(key);
}

async function handleConfigureServerCommand(
  client: Client,
  message: Message,
  serverInput: string
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  const serverKey = normalizeServerKey(serverInput);

  if (!isValidServerKey(serverKey)) {
    await message.reply("Neteisingas serveris. Naudok formatą: ts31.x3.europe");
    return;
  }

  try {
    // Save the server key (short form)
    setServerKey(guildId, serverKey);

    // Download map data
    await updateMapData(serverKey);

    await message.reply(`Travian serveris nustatytas: \`${serverKey}\`\nŽemėlapio duomenys atsisiųsti sėkmingai!`);
    await message.react("✅");
  } catch (error) {
    console.error("[Configure] Failed to download map data:", error);
    await message.reply(`Serveris išsaugotas kaip \`${serverKey}\`, bet nepavyko atsisiųsti žemėlapio duomenų. Botas bandys vėliau.`);
  }
}

async function handleConfigureChannelCommand(
  client: Client,
  message: Message,
  type: "defense" | "scout",
  channelId: string
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  if (type === "defense") {
    setDefenseChannel(guildId, channelId);
    await message.reply(`Gynybos prašymai bus siunčiami į <#${channelId}>`);
  } else {
    setScoutChannel(guildId, channelId);
    await message.reply(`Žvalgybos prašymai bus siunčiami į <#${channelId}>`);
  }

  await message.react("✅");
}

async function handleConfigureScoutRoleCommand(
  client: Client,
  message: Message,
  roleId?: string,
  clearKeyword?: string
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  if (clearKeyword === "clear") {
    const config = getGuildConfig(guildId);
    if (config.scoutRoleId) {
      setScoutRole(guildId, null);
      await message.reply("Žvalgybos rolės paminėjimas pašalintas.");
    } else {
      await message.reply("Žvalgybos rolė nėra sukonfigūruota.");
    }
  } else if (roleId) {
    setScoutRole(guildId, roleId);
    await message.reply(`Žvalgybos prašymai dabar paminės <@&${roleId}>`);
  } else {
    const config = getGuildConfig(guildId);
    if (config.scoutRoleId) {
      setScoutRole(guildId, null);
      await message.reply("Žvalgybos rolės paminėjimas pašalintas.");
    } else {
      await message.reply("Žvalgybos rolė nėra sukonfigūruota.");
    }
  }

  await message.react("✅");
}

// ============================================
// Stats command handlers
// ============================================

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

async function handleStatsLeaderboardCommand(
  client: Client,
  message: Message
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  const leaderboard = getLeaderboard(guildId);

  if (leaderboard.length === 0) {
    await message.reply("Statistika dar neužfiksuota.");
    return;
  }

  const lastReset = getLastResetTime(guildId);
  const resetDate = new Date(lastReset).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  const top15 = leaderboard.slice(0, 15);

  for (let i = 0; i < top15.length; i++) {
    const entry = top15[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    lines.push(
      `${medal} <@${entry.userId}> │ **${formatNumber(entry.totalTroops)}** troops (${entry.villageCount} villages)`
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("Defense Leaderboard")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Stats since ${resetDate}` })
    .setColor(0x5865f2);

  await message.reply({ embeds: [embed] });
}

async function handleStatsUserCommand(
  client: Client,
  message: Message,
  userId: string
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  const userStats = getUserStats(guildId, userId);

  if (!userStats) {
    await message.reply(`<@${userId}> neturi užfiksuotų įnašų.`);
    return;
  }

  // Fetch user info
  let userName = userId;
  let userAvatarUrl: string | undefined;
  try {
    const user = await client.users.fetch(userId);
    userName = user.displayName;
    userAvatarUrl = user.displayAvatarURL();
  } catch {
    // Use ID if user fetch fails
  }

  const lines: string[] = [];

  for (const v of userStats.villages.slice(0, 15)) {
    let villageName = `(${v.x}|${v.y})`;

    if (serverKey) {
      const village = await getVillageAt(serverKey, v.x, v.y);
      if (village) {
        const mapLink = getMapLink(serverKey, v);
        villageName = `[${village.villageName}](${mapLink}) (${v.x}|${v.y})`;
      }
    }

    lines.push(`${villageName} │ **${formatNumber(v.troops)}**`);
  }

  if (userStats.villages.length > 15) {
    lines.push(`*...ir dar ${userStats.villages.length - 15} kaimų*`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Statistika: ${userName}`)
    .setDescription(
      `**Viso:** ${formatNumber(userStats.totalTroops)} karių į ${userStats.villages.length} kaimus\n\n${lines.join("\n")}`
    )
    .setColor(0x5865f2);

  if (userAvatarUrl) {
    embed.setThumbnail(userAvatarUrl);
  }

  await message.reply({ embeds: [embed] });
}

async function handleStatsPlayerCommand(
  client: Client,
  message: Message,
  playerName: string
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  if (!serverKey) {
    await message.reply("Serveris nesukonfigūruotas. Naudok `/configure server` pirma.");
    return;
  }

  const playerData = await getPlayerByExactName(serverKey, playerName);

  if (!playerData) {
    await message.reply(`Žaidėjas "${playerName}" nerastas.`);
    return;
  }

  const { player, villages } = playerData;
  const lines: string[] = [];
  let totalCollected = 0;

  for (const v of villages) {
    const villageStats = getVillageStats(guildId, v.x, v.y);
    const collected = villageStats?.totalTroops || 0;
    totalCollected += collected;

    const mapLink = getMapLink(serverKey, v);
    const collectedStr = collected > 0 ? `**${formatNumber(collected)}**` : "0";
    lines.push(`[${v.villageName}](${mapLink}) (${v.x}|${v.y}) │ ${collectedStr}`);
  }

  const allianceStr = player.allianceName ? ` [${player.allianceName}]` : "";

  const embed = new EmbedBuilder()
    .setTitle(`Kaimai: ${player.playerName}${allianceStr}`)
    .setDescription(
      `**Viso surinkta:** ${formatNumber(totalCollected)} karių\n\n${lines.join("\n")}`
    )
    .setFooter({ text: `${villages.length} kaimai • ${formatNumber(player.totalPopulation)} populiacija` })
    .setColor(0x5865f2);

  await message.reply({ embeds: [embed] });
}

async function handleStatsVillageCommand(
  client: Client,
  message: Message,
  coordsInput: string
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  const coords = parseCoords(coordsInput);
  if (!coords) {
    await message.reply("Neteisingos koordinatės. Naudok formatą `123|456` arba `-45|89`.");
    return;
  }

  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  const villageStats = getVillageStats(guildId, coords.x, coords.y);

  if (!villageStats) {
    await message.reply(`Statistika koordinatėse (${coords.x}|${coords.y}) neužfiksuota.`);
    return;
  }

  let villageName = `(${coords.x}|${coords.y})`;
  let playerInfo = "";

  if (serverKey) {
    const village = await getVillageAt(serverKey, coords.x, coords.y);
    if (village) {
      villageName = village.villageName;
      playerInfo = ` (${village.playerName})`;
    }
  }

  const lines: string[] = [];

  for (const c of villageStats.contributors.slice(0, 15)) {
    lines.push(`<@${c.userId}> │ **${formatNumber(c.troops)}**`);
  }

  if (villageStats.contributors.length > 15) {
    lines.push(`*...ir dar ${villageStats.contributors.length - 15} siuntėjų*`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Gynyba: ${villageName}${playerInfo}`)
    .setDescription(
      `**Viso:** ${formatNumber(villageStats.totalTroops)} karių nuo ${villageStats.contributors.length} gynėjų\n\n${lines.join("\n")}`
    )
    .setColor(0x5865f2);

  await message.reply({ embeds: [embed] });
}

async function handleStatsStacksCommand(
  client: Client,
  message: Message
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  const allVillages = getAllVillageStats(guildId);

  if (allVillages.length === 0) {
    await message.reply("Statistika dar neužfiksuota.");
    return;
  }

  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  const lines: string[] = [];
  const top15 = allVillages.slice(0, 15);

  for (let i = 0; i < top15.length; i++) {
    const v = top15[i];
    let villageName = `(${v.x}|${v.y})`;

    if (serverKey) {
      const village = await getVillageAt(serverKey, v.x, v.y);
      if (village) {
        const mapLink = getMapLink(serverKey, v);
        villageName = `[${village.villageName}](${mapLink}) (${v.x}|${v.y})`;
      }
    }

    const rank = i + 1;
    lines.push(
      `${rank}. ${villageName} │ **${formatNumber(v.totalTroops)}** (${v.contributorCount} siuntėjų)`
    );
  }

  if (allVillages.length > 15) {
    lines.push(`\n*...ir dar ${allVillages.length - 15} kaimų*`);
  }

  const totalTroops = allVillages.reduce((sum, v) => sum + v.totalTroops, 0);

  const embed = new EmbedBuilder()
    .setTitle("Daugiausiai apginti kaimai")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `${allVillages.length} kaimai • ${formatNumber(totalTroops)} viso karių` })
    .setColor(0x5865f2);

  await message.reply({ embeds: [embed] });
}

async function handleStatsResetCommand(
  client: Client,
  message: Message
): Promise<void> {
  const guildId = message.guildId!;

  // Check admin permission
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("Tik administratoriai gali naudoti šią komandą.");
    return;
  }

  const confirmButton = new ButtonBuilder()
    .setCustomId("stats_reset_confirm_msg")
    .setLabel("Taip, išvalyti statistiką")
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId("stats_reset_cancel_msg")
    .setLabel("Atšaukti")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
    cancelButton
  );

  const response = await message.reply({
    content: "Ar tikrai nori išvalyti visą statistiką? Šio veiksmo negalima atšaukti.",
    components: [row],
  });

  try {
    const buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === message.author.id,
      time: 30000,
    });

    if (buttonInteraction.customId === "stats_reset_confirm_msg") {
      resetStats(guildId);
      await buttonInteraction.update({
        content: "Visa statistika išvalyta.",
        components: [],
      });
    } else {
      await buttonInteraction.update({
        content: "Išvalymas atšauktas.",
        components: [],
      });
    }
  } catch {
    // Timeout - remove buttons
    await response.edit({
      content: "Laikas baigėsi.",
      components: [],
    });
  }
}

// ============================================
// Addstat command handler
// ============================================

async function handleAddstatCommand(
  client: Client,
  message: Message,
  coordsInput: string,
  troops: number,
  forUserId?: string
): Promise<void> {
  const guildId = message.guildId!;

  const coords = parseCoords(coordsInput);
  if (!coords) {
    await message.reply("Neteisingos koordinatės. Naudok formatą `123|456` arba `-45|89`.");
    return;
  }

  if (troops === 0) {
    await message.reply("Karių skaičius negali būti 0.");
    return;
  }

  // Record the contribution for the specified user or the message author
  const targetUserId = forUserId || message.author.id;
  recordContribution(guildId, targetUserId, coords.x, coords.y, troops);

  await message.react("✅");
  const userMention = forUserId ? ` (<@${forUserId}>)` : "";
  const action = troops > 0 ? "Pridėta" : "Atimta";
  await message.reply(`${action}: **${Math.abs(troops).toLocaleString()}** karių ${troops > 0 ? "į" : "iš"} (${coords.x}|${coords.y}) statistikos${userMention}.`);
}
