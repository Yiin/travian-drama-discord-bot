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
  PushRequest,
  updatePushRequestChannelInfo,
  getPushRequestByChannelId,
} from "./push-requests";
import { getGuildConfig } from "../config/guild-config";
import { getVillageAt, getMapLink, formatVillageDisplay } from "./map-data";
import { formatResources } from "../utils/format";

// Button IDs for push channels
export const PUSH_SENT_BUTTON_ID = "push_sent_button";
export const PUSH_DELETE_BUTTON_ID = "push_delete_button";

export interface CreatePushChannelResult {
  channelId: string;
  messageId: string;
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
    lines.push(`📍 ${formatVillageDisplay(serverKey, village)} [**[ SEND ]**](${mapLink})`);
  } else {
    lines.push(`📍 [(${request.x}|${request.y})](${mapLink})`);
  }

  // Progress
  const progressPercent = Math.min(
    100,
    Math.round((request.resourcesSent / request.resourcesNeeded) * 100)
  );
  lines.push(`📊 **${formatResources(request.resourcesSent)}/${formatResources(request.resourcesNeeded)}** (${progressPercent}%)`);
  lines.push(buildProgressBar(progressPercent));

  // Contributors (sorted by resources, highest first)
  if (request.contributors.length > 0) {
    lines.push("");
    lines.push("📋 **Contributors:**");
    const sortedContributors = [...request.contributors].sort((a, b) => b.resources - a.resources);
    for (const contributor of sortedContributors) {
      lines.push(`• ${contributor.accountName}: ${formatResources(contributor.resources)}`);
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
    .setLabel("Sent")
    .setStyle(ButtonStyle.Success);

  const deleteButton = new ButtonBuilder()
    .setCustomId(PUSH_DELETE_BUTTON_ID)
    .setLabel("Delete channel")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(sentButton, deleteButton);
}

export async function createPushThread(
  client: Client,
  guildId: string,
  request: PushRequest,
  requestId: number
): Promise<CreatePushChannelResult> {
  const config = getGuildConfig(guildId);

  if (!config.pushChannelId) {
    throw new Error("Push channel is not configured. Use /configure channel type:Push first.");
  }

  if (!config.serverKey) {
    throw new Error("Server key is not configured.");
  }

  const parent = (await client.channels.fetch(config.pushChannelId)) as TextChannel;
  if (!parent) {
    throw new Error(`Could not fetch push channel ${config.pushChannelId}`);
  }

  // Get player name for thread name
  const village = await getVillageAt(config.serverKey, request.x, request.y);
  const playerName = village?.playerName || "unknown";
  const sanitizedPlayerName = sanitizeChannelName(playerName);

  // Build starter message visible in the parent channel feed
  const villageDisplay = village
    ? formatVillageDisplay(config.serverKey, village)
    : `(${request.x}|${request.y})`;
  const starterContent = `**${request.requesterAccount}** push: ${villageDisplay} — needs ${formatResources(request.resourcesNeeded)}`;
  const starter = await parent.send({
    content: starterContent,
    allowedMentions: { parse: [] },
  });

  // Create thread from the starter message
  const thread = await starter.startThread({
    name: `push-${requestId}-${sanitizedPlayerName}`,
    autoArchiveDuration: 10080,
    reason: `Push request #${requestId} by ${request.requesterAccount}`,
  });

  // Build and send embed with buttons inside the thread
  const embed = await buildSinglePushEmbed(request, config.serverKey);
  const buttons = buildPushChannelButtons();

  const message = await thread.send({
    embeds: [embed],
    components: [buttons],
  });

  // Save thread ID (treated as channelId) and message ID to the request
  updatePushRequestChannelInfo(guildId, requestId, thread.id, message.id);

  return {
    channelId: thread.id,
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
    "✅ **Push complete!** Thanks to everyone who contributed."
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
