import {
  Client,
  TextChannel,
  ThreadChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
  time,
  TimestampStyles,
} from "discord.js";
import {
  PushRequest,
  updatePushRequestChannelInfo,
  getPushRequestByChannelId,
} from "./push-requests";
import { getGuildConfig } from "../config/guild-config";
import { getVillageAt, getMapLink, VillageData } from "./map-data";
import { formatResources, percentOf, progressBar } from "../utils/format";
import { v2 } from "./panel";

// Button IDs for push threads
export const PUSH_SENT_BUTTON_ID = "push_sent_button";
export const PUSH_EDIT_BUTTON_ID = "push_edit_button";
export const PUSH_CLOSE_BUTTON_ID = "push_close_button";
export const PUSH_ALL_SENDERS_BUTTON_ID = "push_all_senders_button";

const ACCENT_OPEN = 0xf1c40f;
const ACCENT_DONE = 0x248046;
const ACCENT_GREY = 0x6d6f78;
/** Contributors shown on the card before "and N more". */
export const MAX_INLINE_SENDERS = 8;

export interface CreatePushChannelResult {
  channelId: string;
  messageId: string;
}

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

/** `push-9-playername`; falls back to `push-9` when the name has no ASCII letters or digits. */
export function buildPushThreadName(requestId: number, playerName: string): string {
  const slug = playerName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 30);
  return slug ? `push-${requestId}-${slug}` : `push-${requestId}`;
}

function villageLink(serverKey: string, request: PushRequest, village: VillageData | null): string {
  const name = village ? village.villageName : "Unknown village";
  return `[${name}](${getMapLink(serverKey, request)}) (${request.x}|${request.y})`;
}

function ownerLine(village: VillageData | null, request: PushRequest): string {
  const owner = village
    ? `${village.playerName}${village.allianceName ? ` [${village.allianceName}]` : ""}`
    : "unknown village";
  return `${owner} · needs **${formatResources(request.resourcesNeeded)}** resources`;
}

function buildButtons(showAllSenders: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PUSH_SENT_BUTTON_ID).setLabel("I sent resources").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(PUSH_EDIT_BUTTON_ID).setLabel("Edit amount").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(PUSH_CLOSE_BUTTON_ID).setLabel("Close").setStyle(ButtonStyle.Secondary),
  );
  if (showAllSenders) {
    row.addComponents(
      new ButtonBuilder().setCustomId(PUSH_ALL_SENDERS_BUTTON_ID).setLabel("All senders").setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

/** The thread card: header section with map button, progress, senders, footer, action row. */
export function buildPushCard(request: PushRequest, serverKey: string, village: VillageData | null): ContainerBuilder {
  const accent = request.closed ? ACCENT_GREY : request.completed ? ACCENT_DONE : ACCENT_OPEN;
  const card = new ContainerBuilder().setAccentColor(accent);

  const title = request.closed ? "🔒 Closed" : request.completed ? "✅ Push complete" : "📦 Push to";
  card.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        text(`## ${title} · ${villageLink(serverKey, request, village)}`),
        text(ownerLine(village, request)),
      )
      .setButtonAccessory(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open map").setURL(getMapLink(serverKey, request)),
      ),
  );

  card.addSeparatorComponents(new SeparatorBuilder());
  const senders = request.contributors.length;
  const senderWord = senders === 1 ? "sender" : "senders";
  card.addTextDisplayComponents(
    text(`${progressBar(request.resourcesSent, request.resourcesNeeded)} **${formatResources(request.resourcesSent)} / ${formatResources(request.resourcesNeeded)}** · ${percentOf(request.resourcesSent, request.resourcesNeeded)}% · ${senders} ${senderWord}`),
  );
  if (senders > 0) {
    const sorted = [...request.contributors].sort((a, b) => b.resources - a.resources);
    const shown = sorted.slice(0, MAX_INLINE_SENDERS).map((c) => `${c.accountName} ${formatResources(c.resources)}`);
    const more = sorted.length - shown.length;
    card.addTextDisplayComponents(text(`-# ${shown.join(" · ")}${more > 0 ? ` · and ${more} more` : ""}`));
  }

  card.addSeparatorComponents(new SeparatorBuilder());
  card.addTextDisplayComponents(
    text(`-# Asked by ${request.requesterAccount} ${time(Math.floor(request.createdAt / 1000), TimestampStyles.RelativeTime)} · #${request.id}`),
  );

  if (!request.closed) {
    card.addActionRowComponents(buildButtons(senders > MAX_INLINE_SENDERS));
  }
  return card;
}

export async function createPushThread(
  client: Client,
  guildId: string,
  request: PushRequest,
  requestId: number,
): Promise<CreatePushChannelResult> {
  const config = getGuildConfig(guildId);
  if (!config.pushChannelId) throw new Error("Push channel is not configured.");
  if (!config.serverKey) throw new Error("Server key is not configured.");

  const parent = (await client.channels.fetch(config.pushChannelId)) as TextChannel | null;
  if (!parent) throw new Error(`Could not fetch push channel ${config.pushChannelId}`);

  const village = await getVillageAt(config.serverKey, request.x, request.y);
  const playerName = village?.playerName || "unknown";

  const starter = await parent.send({
    content: `**${request.requesterAccount}** push: ${villageLink(config.serverKey, request, village)} — needs ${formatResources(request.resourcesNeeded)}`,
    allowedMentions: { parse: [] },
  });

  const thread = await starter.startThread({
    name: buildPushThreadName(requestId, playerName),
    autoArchiveDuration: 10080,
    reason: `Push request #${requestId} by ${request.requesterAccount}`,
  });

  const card = buildPushCard(request, config.serverKey, village);
  const message = await thread.send(v2({ components: [card], allowedMentions: { parse: [] } }));

  updatePushRequestChannelInfo(guildId, requestId, thread.id, message.id);
  return { channelId: thread.id, messageId: message.id };
}

async function fetchThread(client: Client, channelId: string | undefined): Promise<ThreadChannel | null> {
  if (!channelId) return null;
  try {
    const channel = await client.channels.fetch(channelId);
    return channel && channel.isThread() ? channel : null;
  } catch {
    return null;
  }
}

/** Re-render the thread card in place. Posts a fresh card only when the old one is gone. */
export async function updatePushCard(client: Client, guildId: string, request: PushRequest): Promise<void> {
  if (!request.channelId) return;
  const config = getGuildConfig(guildId);
  if (!config.serverKey) return;

  const thread = await fetchThread(client, request.channelId);
  if (!thread) return;

  const wasArchived = thread.archived;
  if (wasArchived) {
    try {
      await thread.setArchived(false, "Updating the push card");
    } catch {
      return;
    }
  }

  const village = await getVillageAt(config.serverKey, request.x, request.y);
  const payload = v2({ components: [buildPushCard(request, config.serverKey, village)], allowedMentions: { parse: [] } });
  try {
    let edited = false;
    if (request.messageId) {
      try {
        const message = await thread.messages.fetch(request.messageId);
        await message.edit(payload);
        edited = true;
      } catch {
        edited = false;
      }
    }
    if (!edited) {
      const message = await thread.send(payload);
      const data = getPushRequestByChannelId(guildId, request.channelId);
      if (data) updatePushRequestChannelInfo(guildId, data.requestId, request.channelId, message.id);
    }
  } catch (error) {
    console.error("[PushMessage] Error updating the card:", error);
  }

  if (wasArchived && request.closed) {
    try {
      await thread.setArchived(true, "Push request closed");
    } catch {
      // ignore
    }
  }
}

/** Informational note in the thread (amount changes, transfers). Silent. */
export async function postContributionMessage(client: Client, request: PushRequest, content: string): Promise<void> {
  const thread = await fetchThread(client, request.channelId);
  if (!thread) return;
  try {
    await thread.send({ content, flags: MessageFlags.SuppressNotifications, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error("[PushMessage] Error posting note:", error);
  }
}

export async function markPushComplete(client: Client, guildId: string, request: PushRequest): Promise<void> {
  await updatePushCard(client, guildId, request);

  const thread = await fetchThread(client, request.channelId);
  if (thread && !thread.name.startsWith("✅")) {
    try {
      await thread.setName(`✅${thread.name}`);
    } catch (error) {
      console.error("[PushMessage] Error renaming thread on completion:", error);
    }
  }

  await postContributionMessage(client, request, "✅ **Push complete!** Thanks to everyone who contributed.");
}

export async function archivePushThread(client: Client, request: PushRequest): Promise<void> {
  const thread = await fetchThread(client, request.channelId);
  if (!thread || thread.archived) return;
  try {
    await thread.setArchived(true, "Push request closed");
  } catch (error) {
    console.error("[PushMessage] Error archiving thread:", error);
  }
}

export async function unarchivePushThread(client: Client, request: PushRequest): Promise<void> {
  const thread = await fetchThread(client, request.channelId);
  if (!thread || !thread.archived) return;
  try {
    await thread.setArchived(false, "Push request reopened");
  } catch (error) {
    console.error("[PushMessage] Error unarchiving thread:", error);
  }
}

/** Admin-only hard delete. Not undoable. */
export async function deletePushChannel(client: Client, request: PushRequest): Promise<void> {
  if (!request.channelId) return;
  try {
    const channel = await client.channels.fetch(request.channelId);
    if (channel) await channel.delete("Push request deleted");
  } catch (error) {
    console.error("[PushMessage] Error deleting push thread:", error);
  }
}
