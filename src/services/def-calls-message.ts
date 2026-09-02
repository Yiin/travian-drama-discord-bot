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
  DefCallRequest,
  getRequestByChannelId,
  getActiveRequests,
  updateChannelInfo,
  updateMessageId,
  updateSummaryMessageId,
  getHubButtonMessageId,
  setHubButtonMessageId,
} from "./def-calls";
import { getGuildConfig } from "../config/guild-config";
import {
  getVillageAt,
  getMapLink,
  getRallyPointLink,
  getTribeName,
  VillageData,
} from "./map-data";
import { formatRawTime } from "../utils/time";
import {
  DEFCALL_REQUEST_BUTTON_ID,
  DEFCALL_SENT_BUTTON_ID,
  DEFCALL_SENT_FOR_BUTTON_ID,
  DEFCALL_CLOSE_BUTTON_ID,
} from "./button-handlers/def-call-ids";
import { formatTroops, percentOf, progressBar } from "../utils/format";
import { upsertPanel, v2 } from "./panel";

const ACCENT_OPEN = 0xf1c40f;
const ACCENT_DONE = 0x248046;
const ACCENT_GREY = 0x6d6f78;
const ACCENT_HUB = 0x5865f2;

type CardState = "open" | "fulfilled" | "landed" | "closed";

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

/** `def-12|-45-1430`: coordinates plus landing time (HHMM) in the server's timezone. */
export function buildDefCallThreadName(request: DefCallRequest, serverTimezone?: string): string {
  const hhmm = formatRawTime(request.landingAt, serverTimezone).slice(0, 5).replace(":", "");
  return `def-${request.x}|${request.y}-${hhmm}`;
}

export function isDefCallFulfilled(request: DefCallRequest): boolean {
  return request.troopsNeeded !== undefined && request.troopsSent >= request.troopsNeeded;
}

export function defCallState(request: DefCallRequest): CardState {
  if (request.closed) return "closed";
  if (request.landed || request.landingAt < unixNow()) return "landed";
  if (isDefCallFulfilled(request)) return "fulfilled";
  return "open";
}

function villageLink(serverKey: string, request: DefCallRequest, village: VillageData | null): string {
  const name = village ? village.villageName : "Unknown village";
  return `[${name}](${getMapLink(serverKey, request)}) (${request.x}|${request.y})`;
}

function ownerLine(village: VillageData | null): string {
  if (!village) return "unknown village";
  const alliance = village.allianceName ? ` [${village.allianceName}]` : "";
  return `${village.playerName}${alliance} · ${getTribeName(village.tribe)} · ${formatTroops(village.population)} pop`;
}

function buildStarterContent(
  request: DefCallRequest,
  serverKey: string,
  serverTimezone: string | undefined,
  village: VillageData | null,
): string {
  const state = defCallState(request);
  const prefix = state === "fulfilled" ? "✅ " : state === "landed" ? "🏁 " : state === "closed" ? "🔒 " : "";
  const note = request.comment ? ` — _${request.comment}_` : "";
  const lands = `${time(request.landingAt, TimestampStyles.RelativeTime)} (${formatRawTime(request.landingAt, serverTimezone)})`;
  return `${prefix}<@${request.requesterId}> requests defense: **${villageLink(serverKey, request, village)}** — lands ${lands}${note}`;
}

function buildButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(DEFCALL_SENT_BUTTON_ID).setLabel("I sent troops").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(DEFCALL_SENT_FOR_BUTTON_ID).setLabel("Sent for someone").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(DEFCALL_CLOSE_BUTTON_ID).setLabel("Close").setStyle(ButtonStyle.Secondary),
  );
}

/** The thread card: header section with Send button, progress, note, footer, action row. */
export function buildDefCallCard(
  request: DefCallRequest,
  serverKey: string,
  serverTimezone: string | undefined,
  village: VillageData | null,
): ContainerBuilder {
  const state = defCallState(request);
  const accent = state === "fulfilled" ? ACCENT_DONE : state === "open" ? ACCENT_OPEN : ACCENT_GREY;
  const card = new ContainerBuilder().setAccentColor(accent);

  const title =
    state === "closed" ? "🔒 Closed" :
    state === "landed" ? "🏁 Landed" :
    state === "fulfilled" ? "✅ Covered" : "⚔️ Defend";
  const landsVerb = state === "landed" || state === "closed" ? "Landed" : "Lands";
  const headerLines = [
    `## ${title} · ${villageLink(serverKey, request, village)}`,
    ownerLine(village),
    `🕒 ${landsVerb} **${time(request.landingAt, TimestampStyles.RelativeTime)}** · ${formatRawTime(request.landingAt, serverTimezone)} server time`,
  ];
  const accessory = village
    ? new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Send").setURL(getRallyPointLink(serverKey, village.targetMapId, 1))
    : new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Map").setURL(getMapLink(serverKey, request));
  card.addSectionComponents(
    new SectionBuilder().addTextDisplayComponents(...headerLines.map(text)).setButtonAccessory(accessory),
  );

  card.addSeparatorComponents(new SeparatorBuilder());
  const senders = request.contributors.length;
  const senderWord = senders === 1 ? "sender" : "senders";
  if (request.troopsNeeded) {
    card.addTextDisplayComponents(
      text(`${progressBar(request.troopsSent, request.troopsNeeded)} **${formatTroops(request.troopsSent)} / ${formatTroops(request.troopsNeeded)}** · ${percentOf(request.troopsSent, request.troopsNeeded)}% · ${senders} ${senderWord}`),
    );
  } else {
    card.addTextDisplayComponents(text(`**${formatTroops(request.troopsSent)} sent** · ${senders} ${senderWord}`));
  }
  if (senders > 0) {
    const sorted = [...request.contributors].sort((a, b) => b.troops - a.troops);
    card.addTextDisplayComponents(
      text(`-# ${sorted.map((c) => `${c.accountName} ${formatTroops(c.troops)}`).join(" · ")}`),
    );
  }

  if (request.comment) {
    card.addSeparatorComponents(new SeparatorBuilder());
    card.addTextDisplayComponents(text(`> ${request.comment}`));
  }

  card.addTextDisplayComponents(
    text(`-# Asked by <@${request.requesterId}> ${time(Math.floor(request.createdAt / 1000), TimestampStyles.RelativeTime)} · #${request.id}`),
  );

  if (state !== "closed") {
    card.addActionRowComponents(buildButtons());
  }
  return card;
}

export interface CreateDefCallChannelResult {
  channelId: string;
  messageId: string;
}

export async function createDefCallThread(
  client: Client,
  guildId: string,
  request: DefCallRequest,
  requestId: number,
): Promise<CreateDefCallChannelResult> {
  const config = getGuildConfig(guildId);
  if (!config.defCallsChannelId) throw new Error("Def-calls channel not configured");
  if (!config.serverKey) throw new Error("Server key not configured");

  const parent = (await client.channels.fetch(config.defCallsChannelId)) as TextChannel | null;
  if (!parent) throw new Error(`Could not fetch def-calls channel ${config.defCallsChannelId}`);

  const village = await getVillageAt(config.serverKey, request.x, request.y);
  const starter = await parent.send({
    content: buildStarterContent(request, config.serverKey, config.serverTimezone, village),
    allowedMentions: { parse: [] },
  });

  const thread = await starter.startThread({
    name: buildDefCallThreadName(request, config.serverTimezone),
    autoArchiveDuration: 10080,
    reason: `Def call by ${request.requesterAccount}`,
  });

  const card = buildDefCallCard(request, config.serverKey, config.serverTimezone, village);
  const message = await thread.send(v2({ components: [card], allowedMentions: { parse: [] } }));

  updateChannelInfo(guildId, requestId, thread.id, message.id);
  updateSummaryMessageId(guildId, requestId, starter.id);

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

async function syncStarterMessage(
  client: Client,
  guildId: string,
  request: DefCallRequest,
  content: string,
): Promise<void> {
  const config = getGuildConfig(guildId);
  if (!config.defCallsChannelId || !request.summaryMessageId) return;
  try {
    const parent = (await client.channels.fetch(config.defCallsChannelId)) as TextChannel | null;
    if (!parent) return;
    const message = await parent.messages.fetch(request.summaryMessageId);
    if (message.content !== content) {
      await message.edit({ content, allowedMentions: { parse: [] } });
    }
  } catch (error) {
    console.error("[DefCallsMessage] Error syncing starter message:", error);
  }
}

/** Re-render the thread card in place. Posts a fresh card only when the old one is gone. */
export async function updateDefCallCard(
  client: Client,
  guildId: string,
  request: DefCallRequest,
): Promise<void> {
  if (!request.channelId) return;
  const config = getGuildConfig(guildId);
  if (!config.serverKey) return;

  const village = await getVillageAt(config.serverKey, request.x, request.y);
  await syncStarterMessage(client, guildId, request, buildStarterContent(request, config.serverKey, config.serverTimezone, village));

  const thread = await fetchThread(client, request.channelId);
  if (!thread) return;

  const wasArchived = thread.archived;
  if (wasArchived) {
    // An archived thread cannot be edited; open it for the edit only.
    try {
      await thread.setArchived(false, "Updating the defense card");
    } catch {
      return;
    }
  }

  const card = buildDefCallCard(request, config.serverKey, config.serverTimezone, village);
  const payload = v2({ components: [card], allowedMentions: { parse: [] } });
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
      const data = getRequestByChannelId(guildId, request.channelId);
      if (data) updateMessageId(guildId, data.requestId, message.id);
    }
  } catch (error) {
    console.error("[DefCallsMessage] Error updating the card:", error);
  }

  if (wasArchived && request.closed) {
    try {
      await thread.setArchived(true, "Defense call closed");
    } catch {
      // ignore
    }
  }
}

export async function archiveDefCallThread(client: Client, request: DefCallRequest): Promise<void> {
  const thread = await fetchThread(client, request.channelId);
  if (!thread || thread.archived) return;
  try {
    await thread.setArchived(true, "Defense call closed");
  } catch (error) {
    console.error("[DefCallsMessage] Error archiving thread:", error);
  }
}

export async function unarchiveDefCallThread(client: Client, request: DefCallRequest): Promise<void> {
  const thread = await fetchThread(client, request.channelId);
  if (!thread || !thread.archived) return;
  try {
    await thread.setArchived(false, "Defense call reopened");
  } catch (error) {
    console.error("[DefCallsMessage] Error unarchiving thread:", error);
  }
}

function buildHubPanel(guildId: string): ContainerBuilder {
  const open = getActiveRequests(guildId).map((r) => r.request).filter((r) => !r.landed && r.landingAt >= unixNow());
  const next = open.reduce<number | undefined>((min, r) => (min === undefined || r.landingAt < min ? r.landingAt : min), undefined);
  const summary =
    open.length === 0
      ? "No open calls."
      : `${open.length} open ${open.length === 1 ? "call" : "calls"} · next lands ${time(next!, TimestampStyles.RelativeTime)}`;
  const panel = new ContainerBuilder().setAccentColor(ACCENT_HUB);
  panel.addTextDisplayComponents(text(`**Need defense?** ${summary}`));
  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(DEFCALL_REQUEST_BUTTON_ID).setLabel("Request defense").setStyle(ButtonStyle.Primary),
    ),
  );
  return panel;
}

/**
 * Keep the hub message (open-call count plus the Request button) current and at the
 * bottom of the def-calls channel. Safe to call when nothing changed.
 */
export async function refreshHubChannel(client: Client, guildId: string): Promise<void> {
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
    await upsertPanel({
      channel,
      storedMessageId: getHubButtonMessageId(guildId),
      payload: { components: [buildHubPanel(guildId)], allowedMentions: { parse: [] } },
      save: (id) => setHubButtonMessageId(guildId, id),
    });
  } catch (error) {
    console.error("[DefCallsMessage] Error updating the hub message:", error);
  }
}
