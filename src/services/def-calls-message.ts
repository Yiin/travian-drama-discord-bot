import {
  Client,
  EmbedBuilder,
  TextChannel,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Message,
} from "discord.js";
import {
  DefCallRequest,
  getActiveRequests,
  getRequestByChannelId,
  updateChannelInfo,
  updateMessageId,
  updateSummaryMessageId,
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
    embed.setColor(Colors.Grey).setTitle("⚠️ Gynybos prašymas (vėluoja)");
  } else {
    embed.setColor(Colors.Gold).setTitle("⚔️ Gynybos prašymas");
  }

  const village = await getVillageAt(serverKey, request.x, request.y);
  const mapLink = getMapLink(serverKey, request);
  const rallyLink = village
    ? getRallyPointLink(serverKey, village.targetMapId)
    : mapLink;

  const lines: string[] = [];
  if (village) {
    lines.push(`📍 ${formatVillageDisplay(serverKey, village)} [**[ SIŲSTI ]**](${rallyLink})`);
  } else {
    lines.push(`📍 [(${request.x}|${request.y})](${mapLink}) [**[ SIŲSTI ]**](${rallyLink})`);
  }

  lines.push(`🕒 Leidžiasi <t:${request.landingAt}:R> (<t:${request.landingAt}:T>)`);

  if (request.comment) {
    lines.push(`💬 ${request.comment}`);
  }

  lines.push(`👤 Prašo: <@${request.requesterId}> (${request.requesterAccount})`);

  embed.setDescription(lines.join("\n"));

  if (request.contributors.length > 0) {
    const sorted = [...request.contributors].sort((a, b) => b.troops - a.troops);
    const contribLines = sorted.map(
      (c) => `• ${c.accountName}: ${formatNumber(c.troops)}`
    );
    embed.addFields({
      name: `Atsiuntė (${formatNumber(request.troopsSent)})`,
      value: contribLines.join("\n"),
    });
  } else {
    embed.addFields({
      name: "Atsiuntė",
      value: "_dar niekas_",
    });
  }

  return embed;
}

export function buildPerCallButtons(): ActionRowBuilder<ButtonBuilder> {
  const sentButton = new ButtonBuilder()
    .setCustomId(DEFCALL_SENT_BUTTON_ID)
    .setLabel("Išsiunčiau")
    .setStyle(ButtonStyle.Success);

  const closeButton = new ButtonBuilder()
    .setCustomId(DEFCALL_CLOSE_BUTTON_ID)
    .setLabel("Uždaryti")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(sentButton, closeButton);
}

export interface CreateDefCallChannelResult {
  channelId: string;
  messageId: string;
}

export async function createDefCallChannel(
  client: Client,
  guildId: string,
  request: DefCallRequest,
  requestId: number
): Promise<CreateDefCallChannelResult> {
  const config = getGuildConfig(guildId);
  if (!config.defCallsCategoryId) {
    throw new Error("Def calls category not configured");
  }
  if (!config.serverKey) {
    throw new Error("Server key not configured");
  }

  const guild = await client.guilds.fetch(guildId);
  const channelName = buildChannelName(request);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.defCallsCategoryId,
    reason: `Def call by ${request.requesterAccount}`,
  });

  const embed = await buildPerCallEmbed(request, config.serverKey);
  const buttons = buildPerCallButtons();

  const message = await channel.send({ embeds: [embed], components: [buttons] });

  updateChannelInfo(guildId, requestId, channel.id, message.id);

  return { channelId: channel.id, messageId: message.id };
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
    .setLabel("Prašyti gynybos")
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

  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const botId = client.user?.id;
    const botMessages: Message[] = [];
    for (const msg of messages.values()) {
      if (botId && msg.author.id === botId) {
        botMessages.push(msg);
      }
    }

    if (botMessages.length > 0) {
      try {
        await channel.bulkDelete(botMessages, true);
      } catch {
        for (const msg of botMessages) {
          try {
            await msg.delete();
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (error) {
    console.error("[DefCallsMessage] Error fetching hub messages:", error);
  }

  const active = getActiveRequests(guildId);
  active.sort((a, b) => a.request.landingAt - b.request.landingAt);

  const nowSec = Math.floor(Date.now() / 1000);

  for (const { request, requestId } of active) {
    if (!request.channelId) continue;

    const village = await getVillageAt(config.serverKey, request.x, request.y);
    const villageDisplay = village
      ? `${village.villageName} (${village.playerName})`
      : "Nežinomas kaimas";
    const mapLink = getMapLink(config.serverKey, request);
    const overdueMark = request.landingAt < nowSec ? " ⚠️" : "";
    const commentSuffix = request.comment ? ` — _${request.comment}_` : "";

    const content = `<@${request.requesterId}> prašo gynybos: **[${villageDisplay} (${request.x}|${request.y})](${mapLink})** — leidžiasi <t:${request.landingAt}:R>${overdueMark} — <#${request.channelId}>${commentSuffix}`;

    try {
      const sent = await channel.send({ content, allowedMentions: { parse: [] } });
      updateSummaryMessageId(guildId, requestId, sent.id);
    } catch (error) {
      console.error("[DefCallsMessage] Error sending summary line:", error);
    }
  }

  try {
    const buttonMessage = await channel.send({
      content: "**Reikia gynybos?** Spausk mygtuką žemiau, kad sukurtum naują prašymą.",
      components: [buildHubButtonRow()],
    });
    setHubButtonMessageId(guildId, buttonMessage.id);
  } catch (error) {
    console.error("[DefCallsMessage] Error sending hub button:", error);
  }
}
