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
  getGuildPushData,
  setGlobalPushMessageId,
  getGlobalPushMessageId,
} from "./push-requests";
import { getGuildConfig } from "../config/guild-config";
import { getVillageAt, getRallyPointLink, getMapLink, formatVillageDisplay } from "./map-data";

// Button IDs - will be imported by button-handlers.ts
export const PUSH_REQUEST_BUTTON_ID = "push_request_button";
export const PUSH_SENT_BUTTON_ID = "push_sent_button";

export interface PushLastActionInfo {
  text: string;
  undoId?: number;
}

export async function buildPushEmbed(
  guildId: string,
  client: Client
): Promise<EmbedBuilder> {
  const data = getGuildPushData(guildId);
  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle("Aktyvūs push prašymai")
    .setColor(Colors.Gold)
    .setTimestamp();

  if (!config.serverKey) {
    throw new Error("Server key is not set.");
  }

  if (data.requests.length === 0) {
    embed.setDescription("Nėra aktyvių push užklausų.");
    return embed;
  }

  const lines: string[] = [];

  for (let i = 0; i < data.requests.length; i++) {
    const request = data.requests[i];
    const isFirst = i === 0 && !request.completed;
    const icon = request.completed ? "✅ " : isFirst ? "➡️ " : "";
    const displayId = i + 1; // IDs are 1-based position in array
    let line = `**${displayId}.** ${icon}`;

    const village = await getVillageAt(config.serverKey, request.x, request.y);
    if (village) {
      const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId, 1);
      line += ` ${formatVillageDisplay(config.serverKey, village)} [**[ SIŲSTI ]**](${rallyLink})`;
    } else {
      line += ` [(${request.x}|${request.y})](${getMapLink(config.serverKey, request)})`;
    }

    // Add resource counts
    const progressPercent = Math.min(
      100,
      Math.round((request.resourcesSent / request.resourcesNeeded) * 100)
    );
    line += ` - **${formatNumber(request.resourcesSent)}/${formatNumber(request.resourcesNeeded)}** (${progressPercent}%)`;

    // Add completion badge
    if (request.completed) {
      line += " **BAIGTA**";
    }

    // Add requester account name
    line += ` - ${request.requesterAccount}`;

    lines.push(line);
  }

  if (data.requests.length > 0) {
    lines.push('\n*Išsiuntus spausk žemiau esantį mygtuką arba `/push sent eilesnr resursai`*');
  }

  embed.setDescription(lines.join("\n"));

  return embed;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}

export function buildPushActionButtons(
  hasRequests: boolean
): ActionRowBuilder<ButtonBuilder> {
  const requestButton = new ButtonBuilder()
    .setCustomId(PUSH_REQUEST_BUTTON_ID)
    .setLabel("Reikia push")
    .setStyle(ButtonStyle.Danger);

  const sentButton = new ButtonBuilder()
    .setCustomId(PUSH_SENT_BUTTON_ID)
    .setLabel("Išsiunčiau")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!hasRequests);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(requestButton, sentButton);
}

export async function updatePushGlobalMessage(
  client: Client,
  guildId: string,
  lastAction?: PushLastActionInfo
): Promise<Message | null> {
  const config = getGuildConfig(guildId);

  if (!config.pushChannelId) {
    console.error(`[PushMessage] No push channel configured for guild ${guildId}`);
    return null;
  }

  console.log(`[PushMessage] Guild ${guildId} using push channel: ${config.pushChannelId}`);

  const channel = (await client.channels.fetch(
    config.pushChannelId
  )) as TextChannel | null;

  if (!channel) {
    throw new Error(`Could not fetch push channel for guild ${guildId}`);
  }

  // Send separate confirmation message first (stays in chat history)
  if (lastAction) {
    const undoPart = lastAction.undoId ? ` (\`/undo ${lastAction.undoId}\`)` : "";
    await channel.send(`${lastAction.text}${undoPart}`);
  }

  const data = getGuildPushData(guildId);
  const embed = await buildPushEmbed(guildId, client);
  const buttonRow = buildPushActionButtons(data.requests.length > 0);
  const messageId = getGlobalPushMessageId(guildId);

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
  setGlobalPushMessageId(guildId, newMessage.id);

  return newMessage;
}
