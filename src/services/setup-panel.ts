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
import { Confed, getConfed, getGuildConfig, getScopeConfig, GuildConfig, Permission } from "../config/guild-config";
import { mainScope, resolveScope, Scope } from "../config/scope";
import { ChannelKind, cmd, errors, SETUP_OPEN_BUTTON_ID, SETUP_PING_ADMIN_BUTTON_ID } from "../actions/messages";
import {
  applyChannel,
  applyScoutRole,
  applyServerKey,
  applyTimezone,
  CHANNEL_FIELD,
  CHANNEL_KIND_LABEL,
} from "../actions/setup.action";
import { isAdmin } from "../utils/permissions";
import { buildActionContext } from "../actions/context";
import { buildPermissionSummary, describePermission, PERMISSION_LABEL } from "../actions/permissions";
import { executePermissionChangeAction } from "../actions/permissions.action";
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
export const SETUP_PERMISSION_SELECT_PREFIX = "setup_permission:";
export const SETUP_FINISH_BUTTON_ID = "setup_finish_button";
export const SETUP_REMINDER_BUTTON_ID = "setup_reminder_button";

const CHANNEL_KINDS: ChannelKind[] = ["defense", "defcalls", "scout", "push"];
const PERMISSIONS: Permission[] = ["request", "manage"];

/**
 * Confed panels carry the confed id after the base custom ID
 * (`setup_channel:defense:c2`), so a picker saves to the confed it was built
 * for, wherever the panel was opened.
 */
function withConfed(customId: string, scope: Scope): string {
  return scope.confedId ? `${customId}:${scope.confedId}` : customId;
}

/** Scope named by a custom ID built with `withConfed`. `base` ends before the confed part. */
function scopeFromCustomId(guildId: string, customId: string, base: string): Scope {
  const confedId = customId.slice(base.length).replace(/^:/, "");
  return confedId ? { guildId, confedId } : mainScope(guildId);
}

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

/** Checklist used by `/setup show`: the main confed, then every other confed. */
export function buildSetupSummary(guildId: string): string {
  const config = getGuildConfig(guildId);
  const parts = [buildMainSummary(config)];
  for (const confed of config.confeds ?? []) {
    parts.push(buildConfedSummary(confed));
  }
  return parts.join("\n\n");
}

function buildConfedSummary(confed: Confed): string {
  const line = (ok: boolean, label: string, value?: string) =>
    `${ok ? "✅" : "⬜"} **${label}:** ${value ?? "not set"}`;
  return [
    `**Confed ${confed.name}** · category <#${confed.categoryId}>`,
    ...CHANNEL_KINDS.map((kind) => {
      const id = confed[CHANNEL_FIELD[kind]];
      return line(!!id, `${CHANNEL_KIND_LABEL[kind]} channel`, id ? `<#${id}>` : undefined);
    }),
    line(!!confed.scoutRoleId, "Scout role", confed.scoutRoleId ? `<@&${confed.scoutRoleId}>` : "none (optional)"),
  ].join("\n");
}

function buildMainSummary(config: GuildConfig): string {
  const status = setupStatus(config);
  const line = (ok: boolean, label: string, value?: string) =>
    `${ok ? "✅" : "⬜"} **${label}:** ${value ?? "not set"}`;
  const channel = (id?: string) => (id ? `<#${id}>` : undefined);
  const lines = [
    config.confeds?.length ? "**Bot setup** · main confed" : "**Bot setup**",
    line(status.server, "Travian server", config.serverKey ? `\`${config.serverKey}\`` : undefined),
    ...CHANNEL_KINDS.map((kind) =>
      line(status.channels[kind], `${CHANNEL_KIND_LABEL[kind]} channel`, channel(config[CHANNEL_FIELD[kind]] as string | undefined)),
    ),
    line(status.scoutRole, "Scout role", config.scoutRoleId ? `<@&${config.scoutRoleId}>` : "none (optional)"),
    line(status.timezone, "Timezone", config.serverTimezone ? `\`${config.serverTimezone}\`` : "UTC (optional)"),
    "",
    buildPermissionSummary(config),
    "",
    buildSetupFooter(config),
  ];
  if (!status.complete) {
    lines.push(`Fill the ⬜ items with ${cmd("setup panel")}, or ${cmd("setup server")} and ${cmd("setup channel")}.`);
  }
  lines.push(
    "",
    config.confeds?.length
      ? `-# Commands in a confed's category use that confed's channels. Add another with ${cmd("setup confed add")}.`
      : `-# Several confeds in this server? Give each one its own channels with ${cmd("setup confed add")}.`,
  );
  return lines.join("\n");
}

// --- Panel ---

export interface SetupPanelOptions {
  /** First-run wording ("Thanks for adding Drama") instead of the plain title. */
  welcome?: boolean;
  scope: Scope;
}

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function buildSetupPanel(config: GuildConfig, options: SetupPanelOptions): ContainerBuilder {
  const confed = getConfed(options.scope);
  if (confed) return buildConfedSetupPanel(config, confed, options.scope);
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
  addChannelPickers(panel, config, options.scope);
  panel.addSeparatorComponents(new SeparatorBuilder());

  // 3 · Optional
  panel.addTextDisplayComponents(
    text(
      `**3 · Optional**\n-# Scout role is mentioned on scout requests. Timezone${
        status.timezone ? ` is \`${config.serverTimezone}\`` : " defaults to UTC"
      }; typed landing times are read in it.`,
    ),
  );
  addScoutRolePicker(panel, config, options.scope);
  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SETUP_TIMEZONE_BUTTON_ID)
        .setLabel(status.timezone ? "Change timezone" : "Set timezone")
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  panel.addSeparatorComponents(new SeparatorBuilder());

  // 4 · Permissions
  panel.addTextDisplayComponents(
    text(
      `**4 · Permissions**\n-# Create requests: ${describePermission(config, "request")}. Manage any request: ${describePermission(
        config,
        "manage",
      )}. Leave a picker empty for the default. Only members with Administrator can change these.`,
    ),
  );
  for (const permission of PERMISSIONS) {
    const current = config.permissions?.[permission] ?? [];
    const select = new RoleSelectMenuBuilder()
      .setCustomId(`${SETUP_PERMISSION_SELECT_PREFIX}${permission}`)
      .setPlaceholder(
        permission === "request"
          ? `${PERMISSION_LABEL.request} → roles (empty: everyone)`
          : `${PERMISSION_LABEL.manage} → roles (empty: admins only)`,
      )
      .setMinValues(0)
      .setMaxValues(25);
    if (current.length > 0) select.setDefaultRoles(...current.slice(0, 25));
    panel.addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select));
  }
  panel.addSeparatorComponents(new SeparatorBuilder());

  panel.addTextDisplayComponents(
    text(
      `-# ${buildSetupFooter(config)}\n-# Several confeds in this server? Give each its own channels with ${cmd("setup confed add")}.`,
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

function addChannelPickers(panel: ContainerBuilder, config: GuildConfig, scope: Scope): void {
  for (const kind of CHANNEL_KINDS) {
    const current = config[CHANNEL_FIELD[kind]];
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(withConfed(`${SETUP_CHANNEL_SELECT_PREFIX}${kind}`, scope))
      .setPlaceholder(`${CHANNEL_KIND_LABEL[kind]} → pick a channel`)
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);
    if (current) select.setDefaultChannels(current);
    panel.addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
  }
}

function addScoutRolePicker(panel: ContainerBuilder, config: GuildConfig, scope: Scope): void {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(withConfed(SETUP_ROLE_SELECT_ID, scope))
    .setPlaceholder("Scout role → pick a role (optional)")
    .setMinValues(0)
    .setMaxValues(1);
  if (config.scoutRoleId) roleSelect.setDefaultRoles(config.scoutRoleId);
  panel.addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect));
}

/** A confed's panel: only what a confed has on its own. Server, timezone and permissions stay on the main panel. */
function buildConfedSetupPanel(config: GuildConfig, confed: Confed, scope: Scope): ContainerBuilder {
  const status = setupStatus(config);
  const panel = new ContainerBuilder().setAccentColor(0x5865f2);
  panel.addTextDisplayComponents(
    text(`## ⚙️ Confed setup · ${confed.name}`),
    text(
      `Commands run in <#${confed.categoryId}> use these channels. Pick channels inside that category.${
        status.server ? "" : `\n⚠️ The Travian server is not set yet. Set it on the main panel with ${cmd("setup panel")} outside this category.`
      }`,
    ),
  );
  panel.addSeparatorComponents(new SeparatorBuilder());
  panel.addTextDisplayComponents(text("**Channels**\n-# Pick one channel per feature. You can start with just one."));
  addChannelPickers(panel, config, scope);
  panel.addSeparatorComponents(new SeparatorBuilder());
  panel.addTextDisplayComponents(text("**Scout role** (optional)\n-# Mentioned on this confed's scout requests."));
  addScoutRolePicker(panel, config, scope);
  panel.addSeparatorComponents(new SeparatorBuilder());
  panel.addTextDisplayComponents(text(`-# ${status.channelCount} of ${CHANNEL_KINDS.length} channels set`));
  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(withConfed(SETUP_FINISH_BUTTON_ID, scope))
        .setLabel("Finish setup")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!status.canFinish),
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
      new ButtonBuilder().setCustomId(withConfed(SETUP_OPEN_BUTTON_ID, options.scope)).setLabel("Open setup again").setStyle(ButtonStyle.Secondary),
    ),
  );
  return panel;
}

export function setupPanelPayload(scope: Scope, welcome = false) {
  return v2({ components: [buildSetupPanel(getScopeConfig(scope), { scope, welcome })], allowedMentions: { parse: [] } });
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
    await target.send(setupPanelPayload(mainScope(guild.id), true));
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
  scope: Scope,
): Promise<void> {
  const payload = setupPanelPayload(scope, isWelcomePanel(interaction));
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

/** "Open setup" on an error opens the panel of the channel's confed; "Open setup again" names its confed. */
export async function handleSetupOpenButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const scope =
    interaction.customId === SETUP_OPEN_BUTTON_ID
      ? ((await resolveScope(interaction)) ?? mainScope(guildId))
      : scopeFromCustomId(guildId, interaction.customId, SETUP_OPEN_BUTTON_ID);
  await interaction.reply({ ...setupPanelPayload(scope), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
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
  await refreshPanel(interaction, mainScope(guildId));
  await interaction.followUp({ content: result.text, flags: MessageFlags.Ephemeral });
}

export async function handleSetupChannelSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const [kind, confedId] = interaction.customId.slice(SETUP_CHANNEL_SELECT_PREFIX.length).split(":") as [ChannelKind, string?];
  const scope: Scope = confedId ? { guildId, confedId } : mainScope(guildId);
  const channelId = interaction.values[0];
  if (!CHANNEL_KIND_LABEL[kind] || !channelId) {
    await interaction.reply({ content: errors.generic(), flags: MessageFlags.Ephemeral });
    return;
  }
  const result = await applyChannel(interaction.client, scope, kind, channelId);
  if (!result.ok) {
    await interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
    return;
  }
  await refreshPanel(interaction, scope);
}

export async function handleSetupRoleSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const scope = scopeFromCustomId(guildId, interaction.customId, SETUP_ROLE_SELECT_ID);
  applyScoutRole(scope, interaction.values[0] ?? null);
  await refreshPanel(interaction, scope);
}

/** Permission pickers replace the whole list. Administrator or bot owner only, not Manage Channels. */
export async function handleSetupPermissionSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const permission = interaction.customId.slice(SETUP_PERMISSION_SELECT_PREFIX.length) as Permission;
  if (!PERMISSIONS.includes(permission)) {
    await interaction.reply({ content: errors.generic(), flags: MessageFlags.Ephemeral });
    return;
  }
  // Permissions are guild-wide
  const result = executePermissionChangeAction(buildActionContext(interaction, mainScope(guildId), getGuildConfig(guildId)), {
    permission,
    set: interaction.values,
  });
  if (!result.success) {
    await interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
    return;
  }
  await refreshPanel(interaction, mainScope(guildId));
  await interaction.followUp({ content: result.confirmText, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
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
  await refreshPanel(interaction, mainScope(guildId));
  await interaction.followUp({ content: result.text, flags: MessageFlags.Ephemeral });
}

export async function handleSetupReminderButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  // Several REST calls follow; answer within 3 s first
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const config = getGuildConfig(guildId);
  let channel: TextChannel | null = null;
  if (config.defenseChannelId) {
    channel = (await interaction.client.channels.fetch(config.defenseChannelId).catch(() => null)) as TextChannel | null;
  }
  if (!channel && interaction.channel instanceof TextChannel) channel = interaction.channel;
  if (!channel) {
    await interaction.editReply({ content: "⚠️ **No text channel to post in.** Pick a stack requests channel first." });
    return;
  }
  await postAccountReminder(interaction.client, guildId, channel);
  await interaction.editReply({ content: `✅ Account-link reminder posted in <#${channel.id}>.` });
}

export async function handleSetupFinishButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await requireSetupAdmin(interaction);
  if (!guildId) return;
  const scope = scopeFromCustomId(guildId, interaction.customId, SETUP_FINISH_BUTTON_ID);
  const config = getScopeConfig(scope);
  if (!setupStatus(config).canFinish) {
    await interaction.reply({ content: "⚠️ **Set the server and at least one channel first.**", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  await postInitialPanels(interaction.client, scope);
  await interaction.editReply(
    v2({ components: [buildSetupDonePanel(config, { scope })], allowedMentions: { parse: [] } }),
  );
}

/** Fill the configured channels so none stays blank after setup. */
export async function postInitialPanels(client: Client, scope: Scope): Promise<void> {
  const config = getScopeConfig(scope);
  if (config.defenseChannelId) {
    await updateGlobalMessage(client, scope).catch((error) => console.error("[Setup] stack panel:", error));
  }
  if (config.defCallsChannelId) {
    await refreshHubChannel(client, scope).catch((error) => console.error("[Setup] def-call hub:", error));
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
