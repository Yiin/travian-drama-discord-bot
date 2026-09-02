import {
  Client,
  TextChannel,
  Message,
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
  getGuildDefenseData,
  setGlobalMessageId,
  getGlobalMessageId,
  clearRecentlyCompleted,
  DefenseRequest,
} from "./defense-requests";
import { getGuildConfig } from "../config/guild-config";
import {
  getVillageAt,
  getRallyPointLink,
  getMapLink,
  VillageData,
} from "./map-data";
import {
  REQUEST_DEF_BUTTON_ID,
  SENT_BUTTON_ID,
  STACK_PANEL_EDIT_BUTTON_ID,
} from "./button-handlers/index";
import { cmd, messageUrl } from "../actions/messages";
import { formatTroops, percentOf, progressBar } from "../utils/format";
import { upsertPanel } from "./panel";

export interface LastActionInfo {
  text: string;
  undoId: number;
}

/** Accent colour of the stack panel (Discord red). */
const STACK_ACCENT = 0xda373c;
/**
 * Requests past this count render as plain lines to stay under Discord's
 * 40-component cap: each section costs 4 (separator, section, text, button),
 * the frame costs 10, so 7 sections leave room for the overflow block.
 */
export const MAX_STACK_SECTIONS = 7;

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function toUnix(ms: number): number {
  return Math.floor(ms / 1000);
}

function villageTitle(serverKey: string, request: DefenseRequest, village: VillageData | null): string {
  const mapLink = getMapLink(serverKey, request);
  if (!village) return `#${request.id} · (${request.x}|${request.y})`;
  return `#${request.id} · [${village.villageName}](${mapLink})`;
}

function ownerLine(village: VillageData | null): string {
  if (!village) return "unknown village";
  const alliance = village.allianceName ? ` [${village.allianceName}]` : "";
  return `${village.playerName}${alliance}`;
}

function requestLines(
  serverKey: string,
  request: DefenseRequest,
  village: VillageData | null,
  isFirst: boolean,
): [string, string, string] {
  const marker = isFirst ? "➡️ " : "";
  const line1 = `**${marker}${villageTitle(serverKey, request, village)}** (${request.x}|${request.y}) · ${ownerLine(village)}`;
  const line2 = `${progressBar(request.troopsSent, request.troopsNeeded)} **${formatTroops(request.troopsSent)} / ${formatTroops(request.troopsNeeded)}** · ${percentOf(request.troopsSent, request.troopsNeeded)}%`;
  const notePart = request.message ? `${request.message} · ` : "";
  const line3 = `-# ${notePart}asked by <@${request.requesterId}> ${time(toUnix(request.createdAt), TimestampStyles.RelativeTime)}`;
  return [line1, line2, line3];
}

function linkButton(label: string, url: string): ButtonBuilder {
  return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url);
}

export function buildActionButtons(hasRequests: boolean): ActionRowBuilder<ButtonBuilder> {
  const sentButton = new ButtonBuilder()
    .setCustomId(SENT_BUTTON_ID)
    .setLabel("I sent troops")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!hasRequests);

  const requestButton = new ButtonBuilder()
    .setCustomId(REQUEST_DEF_BUTTON_ID)
    .setLabel("Request stack")
    .setStyle(ButtonStyle.Primary);

  const editButton = new ButtonBuilder()
    .setCustomId(STACK_PANEL_EDIT_BUTTON_ID)
    .setLabel("Edit")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!hasRequests);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(sentButton, requestButton, editButton);
}

/** The live stack panel: one container, one section per request, buttons at the bottom. */
export async function buildStackPanel(guildId: string): Promise<ContainerBuilder> {
  const data = getGuildDefenseData(guildId);
  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    throw new Error("Server key is not set.");
  }
  const serverKey = config.serverKey;

  const panel = new ContainerBuilder().setAccentColor(STACK_ACCENT);
  const open = data.requests.length;
  panel.addTextDisplayComponents(
    text(`## 🛡️ Stack requests · ${open} open · updated ${time(unixNow(), TimestampStyles.RelativeTime)}`),
  );

  if (open === 0) {
    panel.addSeparatorComponents(new SeparatorBuilder());
    panel.addTextDisplayComponents(text("Everyone is safe."));
    panel.addActionRowComponents(buildActionButtons(false));
    return panel;
  }

  const overflow: string[] = [];
  for (let i = 0; i < data.requests.length; i++) {
    const request = data.requests[i];
    const village = await getVillageAt(serverKey, request.x, request.y);
    const [line1, line2, line3] = requestLines(serverKey, request, village, i === 0);

    if (i < MAX_STACK_SECTIONS) {
      panel.addSeparatorComponents(new SeparatorBuilder());
      const accessory = village
        ? linkButton("Send", getRallyPointLink(serverKey, village.targetMapId, 1))
        : linkButton("Map", getMapLink(serverKey, request));
      panel.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(`${line1}\n${line2}\n${line3}`))
          .setButtonAccessory(accessory),
      );
    } else {
      overflow.push(`${line1}\n${line2}`);
    }
  }

  if (overflow.length > 0) {
    panel.addSeparatorComponents(new SeparatorBuilder());
    panel.addTextDisplayComponents(text(overflow.join("\n")));
  }

  panel.addSeparatorComponents(new SeparatorBuilder());
  const completed = data.recentlyCompleted;
  const donePart = completed.length > 0
    ? `✅ Done today: ${completed.map((c) => `(${c.x}|${c.y})`).join(", ")} · `
    : "";
  panel.addTextDisplayComponents(
    text(`-# ${donePart}Report with the button or ${cmd("stack sent")}`),
  );
  panel.addActionRowComponents(buildActionButtons(true));
  return panel;
}

/** Link to the live stack panel, when one has been posted. */
export function getStackPanelUrl(guildId: string): string | undefined {
  const config = getGuildConfig(guildId);
  const messageId = getGlobalMessageId(guildId);
  if (!config.defenseChannelId || !messageId) return undefined;
  return messageUrl(guildId, config.defenseChannelId, messageId);
}

/**
 * Re-render the stack panel. Edits in place while the panel is the last message
 * in the channel, otherwise re-posts it at the bottom. The optional audit line
 * is posted to the channel first, silently.
 */
export async function updateGlobalMessage(
  client: Client,
  guildId: string,
  lastAction?: LastActionInfo,
): Promise<Message | null> {
  const config = getGuildConfig(guildId);

  if (!config.defenseChannelId) {
    console.error(`[DefenseMessage] No defense channel configured for guild ${guildId}`);
    return null;
  }

  const channel = (await client.channels.fetch(config.defenseChannelId)) as TextChannel | null;
  if (!channel) {
    throw new Error(`Could not fetch defense channel for guild ${guildId}`);
  }

  if (lastAction) {
    await channel.send({
      content: lastAction.text,
      flags: MessageFlags.SuppressNotifications,
      allowedMentions: { parse: [] },
    });
  }

  const panel = await buildStackPanel(guildId);
  const { message } = await upsertPanel({
    channel,
    storedMessageId: getGlobalMessageId(guildId),
    payload: { components: [panel], allowedMentions: { parse: [] } },
    save: (id) => setGlobalMessageId(guildId, id),
  });

  clearRecentlyCompleted(guildId);
  return message;
}
