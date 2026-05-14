import {
  Client,
  EmbedBuilder,
  TextChannel,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  DefCallRequest,
  getRequestByChannelId,
  updateChannelInfo,
  updateMessageId,
  updateSummaryMessageId,
  getHubButtonMessageId,
  setHubButtonMessageId,
  closeRequest,
} from "./def-calls";
import { getGuildConfig } from "../config/guild-config";
import { getVillageAt, getMapLink, formatVillageDisplay, getRallyPointLink } from "./map-data";
import {
  DEFCALL_REQUEST_BUTTON_ID,
  DEFCALL_SENT_BUTTON_ID,
  DEFCALL_CLOSE_BUTTON_ID,
} from "./button-handlers/def-call-ids";

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function buildChannelName(request: DefCallRequest): string {
  const date = new Date(request.landingAt * 1000);
  const hh = pad2(date.getUTCHours());
  const mm = pad2(date.getUTCMinutes());
  const xPart = request.x < 0 ? `n${Math.abs(request.x)}` : `${request.x}`;
  const yPart = request.y < 0 ? `n${Math.abs(request.y)}` : `${request.y}`;
  return `def-${xPart}-${yPart}-${hh}${mm}`.toLowerCase();
}

export async function buildPerCallEmbed(
  request: DefCallRequest,
  serverKey: string
): Promise<EmbedBuilder> {
  const nowSec = Math.floor(Date.now() / 1000);
  const overdue = request.landingAt < nowSec && !request.closed;

  const embed = new EmbedBuilder().setTimestamp();
  if (request.closed) {
    embed.setColor(Colors.Green).setTitle("✅ Gynyba pristatyta");
  } else if (overdue) {
    embed.setColor(Colors.Grey).setTitle("⚠️ Defense Request (overdue)");
  } else {
    embed.setColor(Colors.Gold).setTitle("⚔️ Defense Request");
  }

  const village = await getVillageAt(serverKey, request.x, request.y);
  const mapLink = getMapLink(serverKey, request);
  const rallyLink = village
    ? getRallyPointLink(serverKey, village.targetMapId)
    : mapLink;

  const lines: string[] = [];
  if (village) {
    lines.push(`📍 ${formatVillageDisplay(serverKey, village)} [**[ SEND ]**](${rallyLink})`);
  } else {
    lines.push(`📍 [(${request.x}|${request.y})](${mapLink}) [**[ SEND ]**](${rallyLink})`);
  }

  lines.push(`🕒 Lands <t:${request.landingAt}:R> (<t:${request.landingAt}:T>)`);

  if (request.comment) {
    lines.push(`💬 ${request.comment}`);
  }

  lines.push(`👤 Requested by: <@${request.requesterId}> (${request.requesterAccount})`);

  embed.setDescription(lines.join("\n"));

  if (request.contributors.length > 0) {
    const sorted = [...request.contributors].sort((a, b) => b.troops - a.troops);
    const contribLines = sorted.map(
      (c) => `• ${c.accountName}: ${formatNumber(c.troops)}`
    );
    embed.addFields({
      name: `Sent (${formatNumber(request.troopsSent)})`,
      value: contribLines.join("\n"),
    });
  } else {
    embed.addFields({
      name: "Sent",
      value: "_dar niekas_",
    });
  }

  return embed;
}

export function buildPerCallButtons(): ActionRowBuilder<ButtonBuilder> {
  const sentButton = new ButtonBuilder()
    .setCustomId(DEFCALL_SENT_BUTTON_ID)
    .setLabel("Sent")
    .setStyle(ButtonStyle.Success);

  const closeButton = new ButtonBuilder()
    .setCustomId(DEFCALL_CLOSE_BUTTON_ID)
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(sentButton, closeButton);
}

export interface CreateDefCallChannelResult {
  channelId: string;
  messageId: string;
}

export async function createDefCallThread(
  client: Client,
  guildId: string,
  request: DefCallRequest,
  requestId: number
): Promise<CreateDefCallChannelResult> {
  const config = getGuildConfig(guildId);
  if (!config.defCallsChannelId) {
    throw new Error("Def-calls channel not configured");
  }
  if (!config.serverKey) {
    throw new Error("Server key not configured");
  }

  const parent = (await client.channels.fetch(config.defCallsChannelId)) as TextChannel;
  if (!parent) {
    throw new Error(`Could not fetch def-calls channel ${config.defCallsChannelId}`);
  }

  // Build the user-visible summary line — this becomes the thread starter message.
  const village = await getVillageAt(config.serverKey, request.x, request.y);
  const villageDisplay = village
    ? `${village.villageName} (${village.playerName})`
    : "Unknown village";
  const mapLink = getMapLink(config.serverKey, request);
  const commentSuffix = request.comment ? ` — _${request.comment}_` : "";
  const starterContent = `<@${request.requesterId}> requests defense: **[${villageDisplay} (${request.x}|${request.y})](${mapLink})** — lands <t:${request.landingAt}:R>${commentSuffix}`;

  const starter = await parent.send({
    content: starterContent,
    allowedMentions: { parse: [] },
  });

  const thread = await starter.startThread({
    name: buildChannelName(request),
    autoArchiveDuration: 10080,
    reason: `Def call by ${request.requesterAccount}`,
  });

  const embed = await buildPerCallEmbed(request, config.serverKey);
  const buttons = buildPerCallButtons();

  const message = await thread.send({ embeds: [embed], components: [buttons] });

  updateChannelInfo(guildId, requestId, thread.id, message.id);
  updateSummaryMessageId(guildId, requestId, starter.id);

  return { channelId: thread.id, messageId: message.id };
}

export async function updateDefCallChannelEmbed(
  client: Client,
  guildId: string,
  request: DefCallRequest
): Promise<void> {
  if (!request.channelId) {
    return;
  }

  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    return;
  }

  try {
    const channel = (await client.channels.fetch(request.channelId)) as TextChannel | null;
    if (!channel) {
      const requestData = getRequestByChannelId(guildId, request.channelId);
      if (requestData) {
        closeRequest(guildId, requestData.requestId);
      }
      return;
    }

    if (request.messageId) {
      try {
        const oldMessage = await channel.messages.fetch(request.messageId);
        if (oldMessage) {
          await oldMessage.delete();
        }
      } catch {
        // already gone
      }
    }

    const embed = await buildPerCallEmbed(request, config.serverKey);
    const buttons = buildPerCallButtons();

    const newMessage = await channel.send({
      embeds: [embed],
      components: [buttons],
    });

    const requestData = getRequestByChannelId(guildId, request.channelId);
    if (requestData) {
      updateMessageId(guildId, requestData.requestId, newMessage.id);
    }
  } catch (error) {
    console.error("[DefCallsMessage] Error updating per-call embed:", error);
    const requestData = getRequestByChannelId(guildId, request.channelId);
    if (requestData) {
      closeRequest(guildId, requestData.requestId);
    }
  }
}

export async function postDefCallContributionMessage(
  client: Client,
  request: DefCallRequest,
  text: string
): Promise<void> {
  if (!request.channelId) return;
  try {
    const channel = (await client.channels.fetch(request.channelId)) as TextChannel | null;
    if (!channel) return;
    await channel.send(text);
  } catch (error) {
    console.error("[DefCallsMessage] Error posting contribution message:", error);
  }
}

export async function deleteDefCallChannel(
  client: Client,
  request: DefCallRequest
): Promise<void> {
  if (!request.channelId) return;
  try {
    const channel = await client.channels.fetch(request.channelId);
    if (channel) {
      await channel.delete("Def call closed");
    }
  } catch (error) {
    console.error("[DefCallsMessage] Error deleting channel:", error);
  }
}

function buildHubButtonRow(): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(DEFCALL_REQUEST_BUTTON_ID)
    .setLabel("Request defense")
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export async function refreshHubChannel(
  client: Client,
  guildId: string
): Promise<void> {
  const config = getGuildConfig(guildId);
  if (!config.defCallsChannelId || !config.serverKey) return;

  let channel: TextChannel | null = null;
  try {
    channel = (await client.channels.fetch(config.defCallsChannelId)) as TextChannel | null;
  } catch {
    return;
  }
  if (!channel) return;

  // Keep the "Request defense" hub button as the most recent message.
  // Delete the previous button message and repost it at the bottom.
  const previousButtonId = getHubButtonMessageId(guildId);
  if (previousButtonId) {
    try {
      const oldButton = await channel.messages.fetch(previousButtonId);
      if (oldButton) {
        await oldButton.delete();
      }
    } catch {
      // already gone — ignore
    }
  }

  try {
    const buttonMessage = await channel.send({
      content: "**Need defense?** Press the button below to create a new request.",
      components: [buildHubButtonRow()],
    });
    setHubButtonMessageId(guildId, buttonMessage.id);
  } catch (error) {
    console.error("[DefCallsMessage] Error sending hub button:", error);
  }
}
