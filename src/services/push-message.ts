import {
  Client,
  EmbedBuilder,
  TextChannel,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from "discord.js";
import {
  PushRequest,
  updatePushRequestChannelInfo,
  getPushRequestByChannelId,
} from "./push-requests";
import { getGuildConfig } from "../config/guild-config";
import { getVillageAt, getMapLink, formatVillageDisplay } from "./map-data";

// Button IDs for push channels
export const PUSH_SENT_BUTTON_ID = "push_sent_button";
export const PUSH_DELETE_BUTTON_ID = "push_delete_button";

export interface CreatePushChannelResult {
  channelId: string;
  messageId: string;
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

function sanitizeChannelName(playerName: string): string {
  // Lowercase, replace spaces with dashes, remove special chars
  return playerName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 30); // Keep player name portion short
}

function buildProgressBar(percent: number): string {
  const filled = Math.round(percent / 5);
  const empty = 20 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export async function buildSinglePushEmbed(
  request: PushRequest,
  serverKey: string
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setColor(request.completed ? Colors.Green : Colors.Gold)
    .setTimestamp();

  if (request.completed) {
    embed.setTitle("✅ Push Completed");
  } else {
    embed.setTitle("🔔 Push Request");
  }

  // Build description
  const lines: string[] = [];

  // Village info with map link
  const village = await getVillageAt(serverKey, request.x, request.y);
  const mapLink = getMapLink(serverKey, request);
  if (village) {
    lines.push(`📍 ${formatVillageDisplay(serverKey, village)} [**[ SIŲSTI ]**](${mapLink})`);
  } else {
    lines.push(`📍 [(${request.x}|${request.y})](${mapLink})`);
  }

  // Progress
  const progressPercent = Math.min(
    100,
    Math.round((request.resourcesSent / request.resourcesNeeded) * 100)
  );
  lines.push(`📊 **${formatNumber(request.resourcesSent)}/${formatNumber(request.resourcesNeeded)}** (${progressPercent}%)`);
  lines.push(buildProgressBar(progressPercent));

  // Contributors
  if (request.contributors.length > 0) {
    lines.push("");
    lines.push("📋 **Contributors:**");
    for (const contributor of request.contributors) {
      lines.push(`• ${contributor.accountName}: ${formatNumber(contributor.resources)}`);
    }
  }

  // Requested by
  lines.push("");
  lines.push(`*Requested by: ${request.requesterAccount}*`);

  embed.setDescription(lines.join("\n"));

  return embed;
}

export function buildPushChannelButtons(): ActionRowBuilder<ButtonBuilder> {
  const sentButton = new ButtonBuilder()
    .setCustomId(PUSH_SENT_BUTTON_ID)
    .setLabel("Išsiunčiau")
    .setStyle(ButtonStyle.Success);

  const deleteButton = new ButtonBuilder()
    .setCustomId(PUSH_DELETE_BUTTON_ID)
    .setLabel("Ištrinti kanalą")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(sentButton, deleteButton);
}

export async function createPushChannel(
  client: Client,
  guildId: string,
  request: PushRequest,
  requestId: number
): Promise<CreatePushChannelResult> {
  const config = getGuildConfig(guildId);

  if (!config.pushCategoryId) {
    throw new Error("Push category is not configured. Use /configure push-category first.");
  }

  if (!config.serverKey) {
    throw new Error("Server key is not configured.");
  }

  const guild = await client.guilds.fetch(guildId);
  if (!guild) {
    throw new Error(`Could not fetch guild ${guildId}`);
  }

  // Get player name for channel name
  const village = await getVillageAt(config.serverKey, request.x, request.y);
  const playerName = village?.playerName || "unknown";
  const sanitizedPlayerName = sanitizeChannelName(playerName);

  // Create channel name: push-{id}-{playername}
  const channelName = `push-${requestId}-${sanitizedPlayerName}`;

  // Create the channel
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.pushCategoryId,
    reason: `Push request #${requestId} by ${request.requesterAccount}`,
  });

  // Build and send embed with buttons
  const embed = await buildSinglePushEmbed(request, config.serverKey);
  const buttons = buildPushChannelButtons();

  const message = await channel.send({
    embeds: [embed],
    components: [buttons],
  });

  // Save channel and message IDs to the request
  updatePushRequestChannelInfo(guildId, requestId, channel.id, message.id);

  return {
    channelId: channel.id,
    messageId: message.id,
  };
}

export async function updatePushChannelEmbed(
  client: Client,
  guildId: string,
  request: PushRequest
): Promise<void> {
  if (!request.channelId) {
    console.error("[PushMessage] Request has no channel ID, cannot update");
    return;
  }

  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    throw new Error("Server key is not configured.");
  }

  try {
    const channel = await client.channels.fetch(request.channelId) as TextChannel;
    if (!channel) {
      console.error(`[PushMessage] Could not fetch channel ${request.channelId}`);
      return;
    }

    // Delete the old message if it exists
    if (request.messageId) {
      try {
        const oldMessage = await channel.messages.fetch(request.messageId);
        if (oldMessage) {
          await oldMessage.delete();
        }
      } catch {
        // Message might already be deleted, ignore
      }
    }

    // Post new embed at the bottom
    const embed = await buildSinglePushEmbed(request, config.serverKey);
    const buttons = buildPushChannelButtons();

    const newMessage = await channel.send({
      embeds: [embed],
      components: [buttons],
    });

    // Update stored message ID
    const requestData = getPushRequestByChannelId(guildId, request.channelId);
    if (requestData) {
      updatePushRequestChannelInfo(guildId, requestData.requestId, request.channelId, newMessage.id);
    }
  } catch (error) {
    console.error("[PushMessage] Error updating push channel embed:", error);
  }
}

export async function postContributionMessage(
  client: Client,
  request: PushRequest,
  text: string
): Promise<void> {
  if (!request.channelId) {
    console.error("[PushMessage] Request has no channel ID, cannot post message");
    return;
  }

  try {
    const channel = await client.channels.fetch(request.channelId) as TextChannel;
    if (!channel) {
      console.error(`[PushMessage] Could not fetch channel ${request.channelId}`);
      return;
    }

    await channel.send(text);
  } catch (error) {
    console.error("[PushMessage] Error posting contribution message:", error);
  }
}

export async function markPushComplete(
  client: Client,
  guildId: string,
  request: PushRequest
): Promise<void> {
  // Update the embed to show completion styling
  await updatePushChannelEmbed(client, guildId, request);

  // Rename channel to add ✅ prefix
  if (request.channelId) {
    try {
      const channel = await client.channels.fetch(request.channelId) as TextChannel;
      if (channel && !channel.name.startsWith("✅")) {
        await channel.setName(`✅${channel.name}`);
      }
    } catch (error) {
      console.error("[PushMessage] Error renaming channel on completion:", error);
    }
  }

  // Post completion message
  await postContributionMessage(
    client,
    request,
    "✅ **Push užbaigtas!** Dėkojame visiems prisidėjusiems."
  );
}

export async function deletePushChannel(
  client: Client,
  request: PushRequest
): Promise<void> {
  if (!request.channelId) {
    console.error("[PushMessage] Request has no channel ID, cannot delete");
    return;
  }

  try {
    const channel = await client.channels.fetch(request.channelId);
    if (channel) {
      await channel.delete("Push request deleted");
    }
  } catch (error) {
    console.error("[PushMessage] Error deleting push channel:", error);
  }
}
