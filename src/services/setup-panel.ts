import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelSelectMenuInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  Guild,
  GuildMember,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  RoleSelectMenuInteraction,
  SeparatorBuilder,
  TextChannel,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getGuildConfig, GuildConfig, setScoutRole } from "../config/guild-config";
import { ChannelKind, cmd, errors, SETUP_OPEN_BUTTON_ID, SETUP_PING_ADMIN_BUTTON_ID } from "../actions/messages";
import { applyChannel, applyServerKey, applyTimezone, CHANNEL_KIND_LABEL } from "../actions/setup.action";
import { isAdmin } from "../utils/permissions";
import { v2 } from "./panel";
import { updateGlobalMessage } from "./defense-message";
import { refreshHubChannel } from "./def-calls-message";
import { postAccountReminder } from "./account-reminder-message";

/**
 * Onboarding panel: one Components V2 container that walks an admin through
 * server, channels and the optional bits. Posted on GuildCreate, by `/setup panel`,
 * and from the "Open setup" button on the not-set-up error.
 */

export const SETUP_SERVER_BUTTON_ID = "setup_server_button";
export const SETUP_SERVER_MODAL_ID = "setup_server_modal";
export const SETUP_SERVER_INPUT_ID = "setup_server_input";
export const SETUP_TIMEZONE_BUTTON_ID = "setup_timezone_button";
export const SETUP_TIMEZONE_MODAL_ID = "setup_timezone_modal";
export const SETUP_TIMEZONE_INPUT_ID = "setup_timezone_input";
export const SETUP_CHANNEL_SELECT_PREFIX = "setup_channel:";
export const SETUP_ROLE_SELECT_ID = "setup_scout_role_select";
export const SETUP_FINISH_BUTTON_ID = "setup_finish_button";
export const SETUP_REMINDER_BUTTON_ID = "setup_reminder_button";

const CHANNEL_KINDS: ChannelKind[] = ["defense", "defcalls", "scout", "push"];

const CHANNEL_FIELD: Record<ChannelKind, keyof GuildConfig> = {
  defense: "defenseChannelId",
  defcalls: "defCallsChannelId",
  scout: "scoutChannelId",
  push: "pushChannelId",
};

// --- Status ---

export interface SetupStatus {
  server: boolean;
  channels: Record<ChannelKind, boolean>;
  channelCount: number;
  timezone: boolean;
  scoutRole: boolean;
  /** Server plus at least one channel: enough to post the first panels. */
  canFinish: boolean;
  /** Every channel set. */
  complete: boolean;
}

export function setupStatus(config: GuildConfig): SetupStatus {
  const channels = {
    defense: !!config.defenseChannelId,
    defcalls: !!config.defCallsChannelId,
    scout: !!config.scoutChannelId,
    push: !!config.pushChannelId,
  };
  const channelCount = Object.values(channels).filter(Boolean).length;
  const server = !!config.serverKey;
  return {
    server,
    channels,
    channelCount,
    timezone: !!config.serverTimezone,
    scoutRole: !!config.scoutRoleId,
    canFinish: server && channelCount > 0,
    complete: server && channelCount === CHANNEL_KINDS.length,
  };
}

/** `✅ Server set · ✅ 2 of 4 channels · ⬜ Timezone (defaults to UTC)` */
export function buildSetupFooter(config: GuildConfig): string {
  const status = setupStatus(config);
  const mark = (ok: boolean) => (ok ? "✅" : "⬜");
  return [
    `${mark(status.server)} Server ${status.server ? "set" : "not set"}`,
    `${mark(status.channelCount > 0)} ${status.channelCount} of ${CHANNEL_KINDS.length} channels`,
    `${mark(status.timezone)} Timezone${status.timezone ? "" : " (defaults to UTC)"}`,
  ].join(" · ");
}

/** Checklist used by `/setup show` and `!setup show`. */
export function buildSetupSummary(config: GuildConfig): string {
  const status = setupStatus(config);
  const line = (ok: boolean, label: string, value?: string) =>
    `${ok ? "✅" : "⬜"} **${label}:** ${value ?? "not set"}`;
  const channel = (id?: string) => (id ? `<#${id}>` : undefined);
  const lines = [
    "**Bot setup**",
    line(status.server, "Travian server", config.serverKey ? `\`${config.serverKey}\`` : undefined),
    ...CHANNEL_KINDS.map((kind) =>
      line(status.channels[kind], `${CHANNEL_KIND_LABEL[kind]} channel`, channel(config[CHANNEL_FIELD[kind]] as string | undefined)),
    ),
    line(status.scoutRole, "Scout role", config.scoutRoleId ? `<@&${config.scoutRoleId}>` : "none (optional)"),
    line(status.timezone, "Timezone", config.serverTimezone ? `\`${config.serverTimezone}\`` : "UTC (optional)"),
    "",
    buildSetupFooter(config),
  ];
  if (!status.complete) {
    lines.push(`Fill the ⬜ items with ${cmd("setup panel")}, or ${cmd("setup server")} and ${cmd("setup channel")}.`);
  }
  return lines.join("\n");
}

// --- Panel ---

export interface SetupPanelOptions {
  /** First-run wording ("Thanks for adding Drama") instead of the plain title. */
  welcome?: boolean;
  guildId: string;
}

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function buildSetupPanel(config: GuildConfig, options: SetupPanelOptions): ContainerBuilder {
  const status = setupStatus(config);
  const panel = new ContainerBuilder().setAccentColor(0x5865f2);

  panel.addTextDisplayComponents(
    text(options.welcome ? "## 👋 Thanks for adding Drama" : "## ⚙️ Drama setup"),
    text("Three steps and your alliance can start calling defense. Only admins can change these."),
  );
  panel.addSeparatorComponents(new SeparatorBuilder());

  // 1 · Server
  panel.addTextDisplayComponents(
    text(
      `**1 · Travian server** ${status.server ? `· \`${config.serverKey}\`` : "· not set"}\n-# The game world the bot reads map data from.`,
    ),
  );
  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SETUP_SERVER_BUTTON_ID)
        .setLabel(status.server ? "Change server" : "Set server")
        .setStyle(status.server ? ButtonStyle.Secondary : ButtonStyle.Primary),
    ),
  );
  panel.addSeparatorComponents(new SeparatorBuilder());

  // 2 · Channels
  panel.addTextDisplayComponents(text("**2 · Channels**\n-# Pick one channel per feature. You can start with just one."));
  for (const kind of CHANNEL_KINDS) {
    const current = config[CHANNEL_FIELD[kind]] as string | undefined;
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(`${SETUP_CHANNEL_SELECT_PREFIX}${kind}`)
      .setPlaceholder(`${CHANNEL_KIND_LABEL[kind]} → pick a channel`)
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);
    if (current) select.setDefaultChannels(current);
    panel.addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
  }
  panel.addSeparatorComponents(new SeparatorBuilder());

  // 3 · Optional
  panel.addTextDisplayComponents(
    text(
      `**3 · Optional**\n-# Scout role is mentioned on scout requests. Timezone${
        status.timezone ? ` is \`${config.serverTimezone}\`` : " defaults to UTC"
      }; typed landing times are read in it.`,
    ),
  );
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(SETUP_ROLE_SELECT_ID)
    .setPlaceholder("Scout role → pick a role (optional)")
    .setMinValues(0)
    .setMaxValues(1);
  if (config.scoutRoleId) roleSelect.setDefaultRoles(config.scoutRoleId);
  panel.addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect));
  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SETUP_TIMEZONE_BUTTON_ID)
        .setLabel(status.timezone ? "Change timezone" : "Set timezone")
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  panel.addSeparatorComponents(new SeparatorBuilder());

  panel.addTextDisplayComponents(
    text(
      `-# ${buildSetupFooter(config)}\n-# Commands missing? Run \`npm run register\` with \`DISCORD_GUILD_ID=${options.guildId}\`.`,
    ),
  );
  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SETUP_FINISH_BUTTON_ID)
        .setLabel("Finish setup")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!status.canFinish),
      new ButtonBuilder()
        .setCustomId(SETUP_REMINDER_BUTTON_ID)
        .setLabel("Post account-link reminder")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return panel;
}

/** The panel after "Finish setup": what was posted where, and what to do next. */
export function buildSetupDonePanel(config: GuildConfig, options: SetupPanelOptions): ContainerBuilder {
  const panel = new ContainerBuilder().setAccentColor(0x248046);
  const lines = ["## ✅ Setup complete", ""];
  const next: Record<ChannelKind, string> = {
    defense: `Stack requests in <#${config.defenseChannelId}> · ${cmd("stack request")}`,
    defcalls: `Defense calls in <#${config.defCallsChannelId}> · ${cmd("def request")}`,
    scout: `Scouting in <#${config.scoutChannelId}> · ${cmd("scout request")}`,
    push: `Resource pushes in <#${config.pushChannelId}> · ${cmd("push request")}`,
  };
  for (const kind of CHANNEL_KINDS) {
    if (config[CHANNEL_FIELD[kind]]) lines.push(`• ${next[kind]}`);
  }
  const status = setupStatus(config);
  if (!status.complete) {
    lines.push("", `-# Add the other channels later with ${cmd("setup panel")}.`);
  }
  lines.push("", `-# Ask everyone to link their account: press **Post account-link reminder**, or they run ${cmd("account link")}.`);
  panel.addTextDisplayComponents(text(lines.join("\n")));
  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(SETUP_REMINDER_BUTTON_ID).setLabel("Post account-link reminder").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(SETUP_OPEN_BUTTON_ID).setLabel("Open setup again").setStyle(ButtonStyle.Secondary),
    ),
  );
  return panel;
}

export function setupPanelPayload(guildId: string, welcome = false) {
  return v2({ components: [buildSetupPanel(getGuildConfig(guildId), { guildId, welcome })], allowedMentions: { parse: [] } });
}

// --- Entry points ---

/** Post the welcome panel to the system channel, or the first text channel the bot can write to. */
export async function postWelcomePanel(client: Client, guild: Guild): Promise<void> {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const canSend = (channel: TextChannel) =>
    !!me &&
    channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) === true;

  let target: TextChannel | null = null;
  if (guild.systemChannel && canSend(guild.systemChannel)) {
    target = guild.systemChannel;
  } else {
    const channels = await guild.channels.fetch().catch(() => null);
    const first = channels
      ?.filter((c): c is TextChannel => c instanceof TextChannel && canSend(c))
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .first();
    target = first ?? null;
  }
  if (!target) return;

  try {
    await target.send(setupPanelPayload(guild.id, true));
  } catch (error) {
    console.error(`[Setup] Could not post the welcome panel in guild ${guild.id}:`, error);
  }

  void client;
}

/** Log a clear line when slash commands are not registered for this guild. */
export async function warnIfCommandsMissing(guild: Guild): Promise<void> {
  try {
    const registered = await guild.commands.fetch();
    if (registered.size === 0) {
      console.warn(
        `[Setup] No slash commands are registered for guild ${guild.name} (${guild.id}). Run: DISCORD_GUILD_ID=${guild.id} npm run register`,
      );
    }
  } catch (error) {
    console.error(`[Setup] Could not check registered commands for guild ${guild.id}:`, error);
  }
}

// --- Ping-admin throttle ---

const PING_ADMIN_INTERVAL_MS = 10 * 60 * 1000;
const lastAdminPing = new Map<string, number>();

/** One admin ping per guild per 10 minutes. Returns true when this call may post. */
export function shouldPingAdmin(guildId: string, now = Date.now()): boolean {
  const last = lastAdminPing.get(guildId);
  if (last !== undefined && now - last < PING_ADMIN_INTERVAL_MS) return false;
  lastAdminPing.set(guildId, now);
  return true;
}

export function resetAdminPingsForTests(): void {
  lastAdminPing.clear();
}

// --- Interaction handlers ---

type AnyInteraction =
  | ButtonInteraction
  | ModalSubmitInteraction
  | ChannelSelectMenuInteraction
  | RoleSelectMenuInteraction
  | ChatInputCommandInteraction;

async function requireSetupAdmin(interaction: AnyInteraction): Promise<string | null> {
  if (!interaction.guildId) {
    await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
    return null;
  }
  if (!isAdmin(interaction.member as GuildMember)) {
    await interaction.reply({ content: errors.adminOnly(), flags: MessageFlags.Ephemeral });
    return null;
  }
  return interaction.guildId;
}

/** Re-render the panel that holds the component the user pressed. */
async function refreshPanel(
  interaction: ButtonInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction | ModalSubmitInteraction,
  guildId: string,
): Promise<void> {
  const payload = setupPanelPayload(guildId, isWelcomePanel(interaction));
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else if (interaction.isModalSubmit()) {
    if (interaction.isFromMessage()) await interaction.update(payload);
    else await interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  } else {
    await interaction.update(payload);
  }
}

function isWelcomePanel(interaction: { message?: { content?: string; components?: unknown[] } | null }): boolean {
  const message = interaction.message as { components?: { toJSON?: () => unknown }[] } | null | undefined;
  const json = JSON.stringify(message?.components?.map((c) => (c.toJSON ? c.toJSON() : c)) ?? []);
  return json.includes("Thanks for adding Drama");
}

export async function handleSetupOpenButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  await interaction.reply({ ...setupPanelPayload(guildId), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

export async function handleSetupPingAdminButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
    return;
  }
  if (!shouldPingAdmin(guildId)) {
    await interaction.reply({
      content: "✅ An admin was already pinged in the last 10 minutes. Give them a moment.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const channel = interaction.channel;
  if (channel && channel.isSendable()) {
    await channel.send({
      content: `<@${interaction.user.id}> needs an admin to run ${cmd("setup panel")} before the bot can be used here.`,
      allowedMentions: { users: [interaction.user.id] },
    });
  }
  await interaction.reply({ content: "✅ Posted a note for the admins in this channel.", flags: MessageFlags.Ephemeral });
}

export async function handleSetupServerButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const current = getGuildConfig(guildId).serverKey;
  const input = new TextInputBuilder()
    .setCustomId(SETUP_SERVER_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("ts31.x3.europe")
    .setRequired(true)
    .setMaxLength(60);
  if (current) input.setValue(current);
  const modal = new ModalBuilder()
    .setCustomId(SETUP_SERVER_MODAL_ID)
    .setTitle("Travian server")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Server key")
        .setDescription("Short key, for example ts31.x3.europe")
        .setTextInputComponent(input),
    );
  await interaction.showModal(modal);
}

export async function handleSetupServerModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const value = interaction.fields.getTextInputValue(SETUP_SERVER_INPUT_ID);

  // The map download can take longer than 3 s; acknowledge first.
  if (interaction.isFromMessage()) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await applyServerKey(guildId, value);
  if (!result.ok) {
    await interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    return;
  }
  await refreshPanel(interaction, guildId);
  await interaction.followUp({ content: result.text, flags: MessageFlags.Ephemeral });
}

export async function handleSetupChannelSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const kind = interaction.customId.slice(SETUP_CHANNEL_SELECT_PREFIX.length) as ChannelKind;
  const channelId = interaction.values[0];
  if (!CHANNEL_KIND_LABEL[kind] || !channelId) {
    await interaction.reply({ content: errors.generic(), flags: MessageFlags.Ephemeral });
    return;
  }
  applyChannel(guildId, kind, channelId);
  await refreshPanel(interaction, guildId);
}

export async function handleSetupRoleSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  setScoutRole(guildId, interaction.values[0] ?? null);
  await refreshPanel(interaction, guildId);
}

export async function handleSetupTimezoneButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const current = getGuildConfig(guildId).serverTimezone;
  const input = new TextInputBuilder()
    .setCustomId(SETUP_TIMEZONE_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Europe/Vilnius")
    .setRequired(false)
    .setMaxLength(60);
  if (current) input.setValue(current);
  const modal = new ModalBuilder()
    .setCustomId(SETUP_TIMEZONE_MODAL_ID)
    .setTitle("Server timezone")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Timezone")
        .setDescription("For example Europe/Vilnius. Leave empty for UTC.")
        .setTextInputComponent(input),
    );
  await interaction.showModal(modal);
}

export async function handleSetupTimezoneModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const result = applyTimezone(guildId, interaction.fields.getTextInputValue(SETUP_TIMEZONE_INPUT_ID));
  if (!result.ok) {
    await interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
    return;
  }
  await refreshPanel(interaction, guildId);
  await interaction.followUp({ content: result.text, flags: MessageFlags.Ephemeral });
}

export async function handleSetupReminderButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const config = getGuildConfig(guildId);
  let channel: TextChannel | null = null;
  if (config.defenseChannelId) {
    channel = (await interaction.client.channels.fetch(config.defenseChannelId).catch(() => null)) as TextChannel | null;
  }
  if (!channel && interaction.channel instanceof TextChannel) channel = interaction.channel;
  if (!channel) {
    await interaction.reply({ content: "⚠️ **No text channel to post in.** Pick a stack requests channel first.", flags: MessageFlags.Ephemeral });
    return;
  }
  await postAccountReminder(interaction.client, guildId, channel);
  await interaction.reply({ content: `✅ Account-link reminder posted in <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
}

export async function handleSetupFinishButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const config = getGuildConfig(guildId);
  if (!setupStatus(config).canFinish) {
    await interaction.reply({ content: "⚠️ **Set the server and at least one channel first.**", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  await postInitialPanels(interaction.client, guildId);
  await interaction.editReply(
    v2({ components: [buildSetupDonePanel(config, { guildId })], allowedMentions: { parse: [] } }),
  );
}

/** Fill the configured channels so none stays blank after setup. */
export async function postInitialPanels(client: Client, guildId: string): Promise<void> {
  const config = getGuildConfig(guildId);
  if (config.defenseChannelId) {
    await updateGlobalMessage(client, guildId).catch((error) => console.error("[Setup] stack panel:", error));
  }
  if (config.defCallsChannelId) {
    await refreshHubChannel(client, guildId).catch((error) => console.error("[Setup] def-call hub:", error));
  }
  if (config.pushChannelId) {
    await postHintIfEmpty(client, config.pushChannelId, `📦 Push requests appear here as threads. Start one with ${cmd("push request")}.`);
  }
  if (config.scoutChannelId) {
    await postHintIfEmpty(client, config.scoutChannelId, `🔭 Scout requests appear here. Ask with ${cmd("scout request")}.`);
  }
}

async function postHintIfEmpty(client: Client, channelId: string, content: string): Promise<void> {
  const channel = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
  if (!channel) return;
  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (recent?.some((m) => m.author.id === client.user?.id)) return;
  const hint = new ContainerBuilder().setAccentColor(0x4e5058).addTextDisplayComponents(text(content));
  await channel.send(v2({ components: [hint], allowedMentions: { parse: [] } })).catch((error) =>
    console.error(`[Setup] hint in ${channelId}:`, error),
  );
}

export { SETUP_OPEN_BUTTON_ID, SETUP_PING_ADMIN_BUTTON_ID };
