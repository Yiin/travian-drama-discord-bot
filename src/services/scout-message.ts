import {
  Client,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  time,
  TimestampStyles,
} from "discord.js";
import { ScoutRequest, formatScoutId, setScoutMessageId } from "./scout-requests";
import { getGuildConfig } from "../config/guild-config";
import { getVillageAt, getMapLink, getRallyPointLink, getTribeName, VillageData } from "./map-data";
import { SCOUT_GOING_BUTTON_ID, SCOUT_RESULT_BUTTON_ID } from "./button-handlers/scout-ids";
import { formatTroops } from "../utils/format";
import { v2 } from "./panel";

const ACCENT_OPEN = 0xf39c12;
const ACCENT_GOING = 0x3498db;
const ACCENT_DONE = 0x248046;

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

function villageLink(serverKey: string, request: ScoutRequest, village: VillageData | null): string {
  const name = village ? village.villageName : "Unknown village";
  return `[${name}](${getMapLink(serverKey, request)}) (${request.x}|${request.y})`;
}

function ownerLine(village: VillageData | null): string {
  if (!village) return "unknown or new village";
  const alliance = village.allianceName ? ` [${village.allianceName}]` : "";
  return `${village.playerName}${alliance} · ${getTribeName(village.tribe)} · ${formatTroops(village.population)} pop`;
}

function goingLine(request: ScoutRequest): string | undefined {
  if (request.going.length === 0) return undefined;
  const parts = request.going.map((g) =>
    g.arrivalAt ? `<@${g.userId}> lands ${time(g.arrivalAt, TimestampStyles.RelativeTime)}` : `<@${g.userId}> (${g.rawTime})`,
  );
  return `-# 👀 Going: ${parts.join(", ")}`;
}

/** The scout card: header section with a Send button, going list, footer, action row. */
export function buildScoutCard(request: ScoutRequest, serverKey: string, village: VillageData | null): ContainerBuilder {
  const done = request.status === "done";
  const accent = done ? ACCENT_DONE : request.going.length > 0 ? ACCENT_GOING : ACCENT_OPEN;
  const card = new ContainerBuilder().setAccentColor(accent);

  const title = `🔭 Scout ${villageLink(serverKey, request, village)}`;
  const headerLines = [
    done ? `### ~~${title}~~` : `### ${title}`,
    ownerLine(village),
    `> ${request.note}`,
  ];

  let accessory: ButtonBuilder | undefined;
  if (done && request.reportUrl) {
    accessory = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Report").setURL(request.reportUrl);
  } else if (!done && village) {
    accessory = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Send scouts").setURL(getRallyPointLink(serverKey, village.targetMapId, 3));
  } else if (!done) {
    accessory = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Map").setURL(getMapLink(serverKey, request));
  }

  if (accessory) {
    card.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(...headerLines.map(text)).setButtonAccessory(accessory),
    );
  } else {
    card.addTextDisplayComponents(text(headerLines.join("\n")));
  }

  card.addSeparatorComponents(new SeparatorBuilder());
  const going = goingLine(request);
  if (going) card.addTextDisplayComponents(text(going));

  const footerParts: string[] = [];
  if (!done && request.scoutRoleId) footerParts.push(`<@&${request.scoutRoleId}>`);
  if (done) footerParts.push(`✅ Done ${time(Math.floor((request.doneAt ?? Date.now()) / 1000), TimestampStyles.RelativeTime)}`);
  footerParts.push(`asked by <@${request.requesterId}> ${time(Math.floor(request.createdAt / 1000), TimestampStyles.RelativeTime)}`);
  footerParts.push(`#${formatScoutId(request.id)}`);
  card.addTextDisplayComponents(text(`-# ${footerParts.join(" · ")}`));

  if (!done) {
    card.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(SCOUT_GOING_BUTTON_ID).setLabel("I'm going").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(SCOUT_RESULT_BUTTON_ID).setLabel("Report result").setStyle(ButtonStyle.Success),
      ),
    );
  }
  return card;
}

/** Post a new card. The role ping fires once, here. */
export async function postScoutCard(client: Client, guildId: string, request: ScoutRequest): Promise<boolean> {
  const config = getGuildConfig(guildId);
  if (!config.serverKey) return false;
  const channel = (await client.channels.fetch(request.channelId).catch(() => null)) as TextChannel | null;
  if (!channel) return false;

  const village = await getVillageAt(config.serverKey, request.x, request.y);
  const message = await channel.send(
    v2({
      components: [buildScoutCard(request, config.serverKey, village)],
      allowedMentions: request.scoutRoleId ? { roles: [request.scoutRoleId] } : { parse: [] },
    }),
  );
  setScoutMessageId(guildId, request.id, message.id);
  return true;
}

/** Re-render the card in place. */
export async function updateScoutCard(client: Client, guildId: string, request: ScoutRequest): Promise<boolean> {
  const config = getGuildConfig(guildId);
  if (!config.serverKey || !request.messageId) return false;
  try {
    const channel = (await client.channels.fetch(request.channelId)) as TextChannel | null;
    if (!channel) return false;
    const message = await channel.messages.fetch(request.messageId);
    const village = await getVillageAt(config.serverKey, request.x, request.y);
    await message.edit(v2({ components: [buildScoutCard(request, config.serverKey, village)], allowedMentions: { parse: [] } }));
    return true;
  } catch (error) {
    console.error("[ScoutMessage] Error updating the card:", error);
    return false;
  }
}
