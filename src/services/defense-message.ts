import {
  Client,
  EmbedBuilder,
  TextChannel,
  Colors,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  getGuildDefenseData,
  setGlobalMessageId,
  getGlobalMessageId,
  clearRecentlyCompleted,
} from "./defense-requests";
import { getGuildConfig } from "../config/guild-config";
import { getVillageAt, getRallyPointLink, getMapLink, formatVillageDisplay } from "./map-data";
import { REQUEST_DEF_BUTTON_ID, SENT_BUTTON_ID } from "./button-handlers";

export interface LastActionInfo {
  text: string;
  undoId: number;
}

export async function buildGlobalEmbed(
  guildId: string,
  client: Client
): Promise<EmbedBuilder> {
  const data = getGuildDefenseData(guildId);
  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle("Aktyvūs stacko prašymai")
    .setColor(Colors.Red)
    .setTimestamp();

  if (!config.serverKey) {
    throw new Error('Server key is not set.')
  }

  if (data.requests.length === 0) {
    embed.setDescription("Visi saugūs.");
    return embed;
  }

  const lines: string[] = [];

  for (let i = 0; i < data.requests.length; i++) {
    const request = data.requests[i];
    const isFirst = i === 0;
    const icon = isFirst ? "➡️ " : "";
    const displayId = i + 1; // IDs are 1-based position in array
    let line = `**${displayId}.** ${icon}`;

    const village = await getVillageAt(config.serverKey, request.x, request.y);
    if (village) {
      const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId, 1);
      line += ` ${formatVillageDisplay(config.serverKey, village)} [**[ SIŲSTI ]**](${rallyLink})`;
    } else {
      line += ` [(${request.x}|${request.y})](${getMapLink(config.serverKey, request)})`;
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
    if (truncatedMessage.length > 0) {
      line += ` - "${truncatedMessage}"`;
    }

    // Add requester
    // line += ` - <@${request.requesterId}>`;

    lines.push(line);
  }

  if (data.requests.length > 0) {
    lines.push('\n*Išsiuntus spausk žemiau esantį mygtuką arba `/stack eilesnr kariai`*')
  }

  embed.setDescription(lines.join("\n"));

  // Add recently completed to footer
  const completed = data.recentlyCompleted;
  if (completed.length > 0) {
    const completedText = completed
      .map((c) => `(${c.x}|${c.y})`)
      .join(", ");
    embed.setFooter({
      text: `Pabaigtas: ${completedText}`,
    });
  }

  return embed;
}

export function buildActionButtons(
  hasRequests: boolean
): ActionRowBuilder<ButtonBuilder> {
  const defButton = new ButtonBuilder()
    .setCustomId(REQUEST_DEF_BUTTON_ID)
    .setLabel("Reikia stack")
    .setStyle(ButtonStyle.Danger);

  const sentButton = new ButtonBuilder()
    .setCustomId(SENT_BUTTON_ID)
    .setLabel("Išsiunčiau")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!hasRequests);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(defButton, sentButton);
}

export async function updateGlobalMessage(
  client: Client,
  guildId: string,
  lastAction?: LastActionInfo
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

    // Send separate confirmation message first (stays in chat history)
    if (lastAction) {
      const undoPart = lastAction.undoId > 0 ? ` (\`/undo ${lastAction.undoId}\`)` : "";
      await channel.send(`${lastAction.text}${undoPart}`);
    }

    const data = getGuildDefenseData(guildId);
    const embed = await buildGlobalEmbed(guildId, client);
    const buttonRow = buildActionButtons(data.requests.length > 0);
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
    const newMessage = await channel.send({
      embeds: [embed],
      components: [buttonRow],
    });
    setGlobalMessageId(guildId, newMessage.id);

    // Clear recently completed after showing them
    clearRecentlyCompleted(guildId);

    return newMessage;
  } catch (error) {
    console.error(`[DefenseMessage] Error updating global message:`, error);
    return null;
  }
}

