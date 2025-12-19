import { Client, EmbedBuilder, TextChannel, Colors, Message } from "discord.js";
import {
  getGuildDefenseData,
  setGlobalMessageId,
  getGlobalMessageId,
  clearRecentlyCompleted,
  DefenseRequest,
  CompletedRequest,
} from "./defense-requests";
import { getGuildConfig } from "../config/guild-config";
import { getVillageAt, getRallyPointLink, getMapLink } from "./map-data";

export async function buildGlobalEmbed(
  guildId: string,
  client: Client
): Promise<EmbedBuilder> {
  const data = getGuildDefenseData(guildId);
  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle("Active Defense Requests")
    .setColor(Colors.Red)
    .setTimestamp();

  if (!config.serverKey) {
    throw new Error('Server key is not set.')
  }

  if (data.requests.length === 0) {
    embed.setDescription("No active defense requests.");
    return embed;
  }

  const lines: string[] = [];

  for (let i = 0; i < data.requests.length; i++) {
    const request = data.requests[i];
    const isFirst = i === 0;
    const icon = isFirst ? "➡️ " : "";
    const displayId = i + 1; // IDs are 1-based position in array
    let line = `**${displayId}.** ${icon} [(${request.x}|${request.y})](${getMapLink(config.serverKey, request)})`;

    const village = await getVillageAt(config.serverKey, request.x, request.y);
    if (village) {
      const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId);
      line += ` **${village.villageName}** (${village.playerName}) [**[ SEND ]**](${rallyLink})`;
    }

    // Add troop counts
    const progressPercent = Math.min(
      100,
      Math.round((request.troopsSent / request.troopsNeeded) * 100)
    );
    line += ` - **${request.troopsSent}/${request.troopsNeeded}** (${progressPercent}%)`;

    // Add message (truncate if too long)
    const truncatedMessage =
      request.message.length > 50
        ? request.message.substring(0, 47) + "..."
        : request.message;
    line += ` - "${truncatedMessage}"`;

    // Add requester
    // line += ` - <@${request.requesterId}>`;

    lines.push(line);
  }

  embed.setDescription(lines.join("\n"));

  // Add recently completed to footer
  const completed = data.recentlyCompleted;
  if (completed.length > 0) {
    const completedText = completed
      .map((c) => `(${c.x}|${c.y})`)
      .join(", ");
    embed.setFooter({
      text: `Completed: ${completedText}`,
    });
  }

  return embed;
}

export async function updateGlobalMessage(
  client: Client,
  guildId: string
): Promise<Message | null> {
  const config = getGuildConfig(guildId);

  if (!config.defenseChannelId) {
    console.error(`[DefenseMessage] No defense channel configured for guild ${guildId}`);
    return null;
  }

  console.log(`[DefenseMessage] Guild ${guildId} using defense channel: ${config.defenseChannelId}`);

  try {
    const channel = (await client.channels.fetch(
      config.defenseChannelId
    )) as TextChannel | null;

    if (!channel) {
      console.error(`[DefenseMessage] Could not fetch defense channel for guild ${guildId}`);
      return null;
    }

    const embed = await buildGlobalEmbed(guildId, client);
    const messageId = getGlobalMessageId(guildId);

    // Delete existing message if it exists
    if (messageId) {
      try {
        const existingMessage = await channel.messages.fetch(messageId);
        await existingMessage.delete();
      } catch {
        // Message might have been deleted already, ignore
      }
    }

    // Post new message
    const newMessage = await channel.send({ embeds: [embed] });
    setGlobalMessageId(guildId, newMessage.id);

    // Clear recently completed after showing them
    clearRecentlyCompleted(guildId);

    return newMessage;
  } catch (error) {
    console.error(`[DefenseMessage] Error updating global message:`, error);
    return null;
  }
}

export async function sendTroopNotification(
  client: Client,
  guildId: string,
  userId: string,
  troops: number,
  request: DefenseRequest,
  isComplete: boolean,
  requestId: number
): Promise<void> {
  const config = getGuildConfig(guildId);

  if (!config.defenseChannelId) {
    return;
  }

  try {
    const channel = (await client.channels.fetch(
      config.defenseChannelId
    )) as TextChannel | null;

    if (!channel) {
      return;
    }

    // Get village info for detailed message
    const village = config.serverKey
      ? await getVillageAt(config.serverKey, request.x, request.y)
      : null;
    const villageName = village?.villageName || "Unknown";
    const playerName = village?.playerName || "Unknown";

    let message: string;
    if (isComplete) {
      message = `**Request #${requestId} complete!** <@${userId}> sent the final **${troops}** troops to **${villageName}** (${request.x}|${request.y}) - ${playerName} - Total: **${request.troopsSent}/${request.troopsNeeded}**`;
    } else {
      message = `<@${userId}> sent **${troops}** troops to **${villageName}** (${request.x}|${request.y}) - ${playerName} - Progress: **${request.troopsSent}/${request.troopsNeeded}**`;
    }

    await channel.send(message);
  } catch (error) {
    console.error(`[DefenseMessage] Error sending notification:`, error);
  }
}
