import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  chatInputApplicationCommandMention,
  Client,
  MessageFlags,
} from "discord.js";

/**
 * The only place for user-facing error and success wording.
 *
 * Errors:   ⚠️ **What went wrong.** How to fix it.
 * Success:  ✅ What changed. New state.
 */

// --- Command mentions ---

const commandIds = new Map<string, string>();

/** Cache slash command IDs so `cmd()` can render clickable mentions. Call once at ClientReady. */
export async function cacheCommandIds(client: Client, guildId?: string): Promise<void> {
  try {
    const commands = guildId
      ? await client.application?.commands.fetch({ guildId })
      : await client.application?.commands.fetch();
    commands?.forEach((command) => commandIds.set(command.name, command.id));
  } catch (error) {
    console.error("Failed to cache command IDs:", error);
  }
}

/** Clickable `</name sub:id>` mention, or `` `/name sub` `` when the ID is unknown. */
export function cmd(path: string): string {
  const [name, sub, subsub] = path.trim().split(/\s+/);
  const id = commandIds.get(name);
  if (!id) return `\`/${path.trim()}\``;
  if (subsub) return chatInputApplicationCommandMention(name, sub, subsub, id);
  if (sub) return chatInputApplicationCommandMention(name, sub, id);
  return chatInputApplicationCommandMention(name, id);
}

// --- Channel kinds ---

export type ChannelKind = "defense" | "scout" | "defcalls" | "push";

const CHANNEL_LABEL: Record<ChannelKind, string> = {
  defense: "stack requests",
  scout: "scouting",
  defcalls: "defense calls",
  push: "resource pushes",
};

const CHANNEL_SETUP_TYPE: Record<ChannelKind, string> = {
  defense: "Stack requests",
  scout: "Scouting",
  defcalls: "Defense calls",
  push: "Resource pushes",
};

// --- Errors ---

export const errors = {
  guildOnly: () => "⚠️ **This only works inside a server.**",

  notSetUp: () =>
    `⚠️ **Bot is not set up yet.** An admin needs to run ${cmd("setup server")} to pick the Travian server.`,

  channelMissing: (kind: ChannelKind) =>
    `⚠️ **No ${CHANNEL_LABEL[kind]} channel yet.** An admin can pick one with ${cmd("setup channel")} (type: ${CHANNEL_SETUP_TYPE[kind]}).`,

  channelGone: (kind: ChannelKind) =>
    `⚠️ **The ${CHANNEL_LABEL[kind]} channel no longer exists.** An admin can pick a new one with ${cmd("setup channel")}.`,

  wrongChannel: (kind: ChannelKind, channelId: string | undefined, slashAlternative: string) =>
    channelId
      ? `⚠️ **This command works in <#${channelId}>.** Or use ${cmd(slashAlternative)} from anywhere.`
      : `⚠️ **No ${CHANNEL_LABEL[kind]} channel is set.** Use ${cmd(slashAlternative)} instead.`,

  notInThread: (what: string) =>
    `⚠️ **This is not a ${what} thread.** Run it inside the thread the bot created for the request.`,

  accountNotLinked: () =>
    `⚠️ **Link your in-game account first.** Run ${cmd("account link")} with your player name.`,

  otherAccountNotLinked: (userId: string) =>
    `⚠️ **<@${userId}> has no linked in-game account.** They can link it with ${cmd("account link")}.`,

  invalidCoords: () =>
    "⚠️ **Those are not coordinates.** Use the form `123|456` or `-45|89`.",

  invalidCount: (what: string) =>
    `⚠️ **Enter a whole number of ${what} greater than 0.**`,

  countIsZero: (what: string) => `⚠️ **${capitalize(what)} count cannot be 0.**`,

  notFound: (what: string, id?: number | string) =>
    id === undefined
      ? `⚠️ **${capitalize(what)} not found.**`
      : `⚠️ **${capitalize(what)} #${id} not found.** It may have been completed or removed.`,

  mapUnavailable: () =>
    "⚠️ **Map data is not available right now.** Try again in a minute.",

  adminOnly: () => "⚠️ **Only administrators can do this.**",

  generic: () => "⚠️ **Something went wrong.** Try again, and tell an admin if it keeps happening.",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// --- Success ---

export const success = {
  /** `✅ What changed. New state.` */
  text: (whatChanged: string, newState?: string) =>
    newState ? `✅ ${whatChanged} ${newState}` : `✅ ${whatChanged}`,
};

// --- Confirmation payload with Undo and jump link ---

export const UNDO_BUTTON_PREFIX = "undo:";

export interface ConfirmationOptions {
  /** Action ID recorded in action history; adds an Undo button when > 0. */
  actionId?: number;
  /** Message URL of the panel that changed; adds a Link button. */
  panelUrl?: string;
  panelLabel?: string;
}

/** Ephemeral confirmation with optional Undo and jump buttons. */
export function confirmation(content: string, options: ConfirmationOptions = {}) {
  const buttons: ButtonBuilder[] = [];
  if (options.actionId && options.actionId > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${UNDO_BUTTON_PREFIX}${options.actionId}`)
        .setLabel("Undo")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (options.panelUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel(options.panelLabel ?? "Jump to panel")
        .setStyle(ButtonStyle.Link)
        .setURL(options.panelUrl),
    );
  }
  return {
    content,
    components: buttons.length
      ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
      : [],
    flags: MessageFlags.Ephemeral as const,
  };
}

/** Same payload shape, for `editReply` after a deferred ephemeral reply (flags are already set). */
export function confirmationEdit(content: string, options: ConfirmationOptions = {}) {
  const { flags: _flags, ...rest } = confirmation(content, options);
  return rest;
}

/** Ephemeral error payload. */
export function errorReply(content: string) {
  return { content, components: [], flags: MessageFlags.Ephemeral as const };
}

export function messageUrl(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export function channelUrl(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

/** Turn a public audit line ("<@id> sent **200** to X") into an actor-facing confirmation. */
export function asConfirm(actionText: string): string {
  const stripped = actionText.replace(/^<@!?\d+>\s*/, "").replace(/\s*\(`\/undo \d+`\)\s*$/, "");
  const sentence = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return `✅ ${sentence}${/[.!?]$/.test(sentence) ? "" : "."}`;
}
