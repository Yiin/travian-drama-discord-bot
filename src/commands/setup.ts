import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types";
import {
  getGuildConfig,
  getAllConfiguredServers,
  setServerKey,
  setDefenseChannel,
  setScoutChannel,
  setPushChannelId,
  setDefCallsChannelId,
  setScoutRole,
  setServerTimezone,
  GuildConfig,
} from "../config/guild-config";
import { updateMapData } from "../services/map-data";
import { withRetry } from "../utils/retry";
import { isValidTimezone } from "../utils/time";
import { normalizeServerKey, isValidServerKey } from "../services/message-commands/utils";
import { filterChoices } from "../utils/choices";
import { ChannelKind, cmd } from "../actions/messages";
import { guildCommand, requireGuild } from "./shared";

const CHANNEL_CHOICES: { name: string; value: ChannelKind }[] = [
  { name: "Stack requests", value: "defense" },
  { name: "Defense calls", value: "defcalls" },
  { name: "Scouting", value: "scout" },
  { name: "Resource pushes", value: "push" },
];

export const setupCommand: Command = {
  topic: "admin",
  summary: "Pick the Travian server, channels, scout role and timezone",
  data: guildCommand("setup", "Set up the bot: server, channels, scout role, timezone (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("server")
        .setDescription("Pick the Travian game world the bot reads map data from")
        .addStringOption((opt) =>
          opt
            .setName("value")
            .setDescription("Server key, for example ts31.x3.europe")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Pick the channel for one feature")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Which feature")
            .setRequired(true)
            .addChoices(...CHANNEL_CHOICES)
        )
        .addChannelOption((opt) =>
          opt
            .setName("value")
            .setDescription("The channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("timezone")
        .setDescription("Timezone that typed landing times are in (the Travian server's timezone)")
        .addStringOption((opt) =>
          opt
            .setName("value")
            .setDescription("IANA name, for example Europe/Vilnius. Type clear to use UTC.")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("scoutrole")
        .setDescription("Role to mention on scout requests; leave empty to clear it")
        .addRoleOption((opt) => opt.setName("role").setDescription("The role to mention"))
    )
    .addSubcommand((sub) => sub.setName("show").setDescription("Show the current setup")),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    const typed = String(focused.value);
    const sub = interaction.options.getSubcommand(false);

    if (sub === "timezone") {
      const zones = Intl.supportedValuesOf("timeZone").map((z) => ({ name: z, value: z }));
      const choices = filterChoices([{ name: "clear (use UTC)", value: "clear" }, ...zones], typed);
      await interaction.respond(choices);
      return;
    }

    if (sub === "server") {
      const current = interaction.guildId ? getGuildConfig(interaction.guildId).serverKey : undefined;
      const known = new Set<string>();
      if (current) known.add(current);
      for (const s of getAllConfiguredServers()) known.add(s.serverKey);
      const normalized = normalizeServerKey(typed);
      if (normalized && isValidServerKey(normalized)) known.add(normalized);
      const choices = [...known].map((key) => ({
        name: key === current ? `${key} (current)` : key,
        value: key,
      }));
      await interaction.respond(filterChoices(choices, typed));
      return;
    }

    await interaction.respond([]);
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

    switch (interaction.options.getSubcommand()) {
      case "server":
        await handleServer(interaction, guildId);
        return;
      case "channel":
        await handleChannel(interaction, guildId);
        return;
      case "timezone":
        await handleTimezone(interaction, guildId);
        return;
      case "scoutrole":
        await handleScoutRole(interaction, guildId);
        return;
      case "show":
        await interaction.reply({ content: buildSetupSummary(getGuildConfig(guildId)), flags: MessageFlags.Ephemeral });
        return;
    }
  },
};

/** Ephemeral checklist of the current setup, ✅ for set items and ⬜ for missing ones. */
export function buildSetupSummary(config: GuildConfig): string {
  const line = (ok: boolean, label: string, value?: string) =>
    `${ok ? "✅" : "⬜"} **${label}:** ${value ?? "not set"}`;
  const channel = (id?: string) => (id ? `<#${id}>` : undefined);
  const lines = [
    "**Bot setup**",
    line(!!config.serverKey, "Travian server", config.serverKey ? `\`${config.serverKey}\`` : undefined),
    line(!!config.defenseChannelId, "Stack requests channel", channel(config.defenseChannelId)),
    line(!!config.defCallsChannelId, "Defense calls channel", channel(config.defCallsChannelId)),
    line(!!config.scoutChannelId, "Scouting channel", channel(config.scoutChannelId)),
    line(!!config.pushChannelId, "Resource pushes channel", channel(config.pushChannelId)),
    line(!!config.scoutRoleId, "Scout role", config.scoutRoleId ? `<@&${config.scoutRoleId}>` : "none (optional)"),
    line(!!config.serverTimezone, "Timezone", config.serverTimezone ? `\`${config.serverTimezone}\`` : "UTC (optional)"),
  ];
  const missing = !config.serverKey || !config.defenseChannelId || !config.defCallsChannelId || !config.scoutChannelId || !config.pushChannelId;
  if (missing) {
    lines.push("", `Fill the ⬜ items with ${cmd("setup server")} and ${cmd("setup channel")}.`);
  }
  return lines.join("\n");
}

async function handleServer(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const serverKey = normalizeServerKey(interaction.options.getString("value", true));

  if (!isValidServerKey(serverKey)) {
    await interaction.reply({
      content: "⚠️ **That is not a Travian server key.** Use the form `ts31.x3.europe`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  setServerKey(guildId, serverKey);
  try {
    await updateMapData(serverKey);
    await interaction.editReply({ content: `✅ Travian server set to \`${serverKey}\`. Map data downloaded.` });
  } catch (error) {
    console.error("[Setup] Failed to download map data:", error);
    await interaction.editReply({
      content: `✅ Travian server set to \`${serverKey}\`. ⚠️ Map data could not be downloaded yet; the bot will retry.`,
    });
  }
}

async function handleChannel(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const type = interaction.options.getString("type", true) as ChannelKind;
  const channel = interaction.options.getChannel("value", true);

  const setters: Record<ChannelKind, (guildId: string, channelId: string) => void> = {
    defense: setDefenseChannel,
    scout: setScoutChannel,
    defcalls: setDefCallsChannelId,
    push: setPushChannelId,
  };
  setters[type](guildId, channel.id);

  const label = CHANNEL_CHOICES.find((c) => c.value === type)?.name ?? type;
  await interaction.reply({
    content: `✅ ${label} now go to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTimezone(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const value = interaction.options.getString("value", true).trim();

  if (value.toLowerCase() === "clear") {
    setServerTimezone(guildId, null);
    await interaction.reply({ content: "✅ Timezone cleared. Typed times are read as UTC.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isValidTimezone(value)) {
    await interaction.reply({
      content: `⚠️ **Unknown timezone \`${value}\`.** Use an IANA name, for example \`Europe/Vilnius\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  setServerTimezone(guildId, value);
  await interaction.reply({
    content: `✅ Timezone set to \`${value}\`. Typed times are read as local time there.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleScoutRole(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const role = interaction.options.getRole("role");

  if (role) {
    setScoutRole(guildId, role.id);
    await interaction.reply({ content: `✅ Scout requests now mention <@&${role.id}>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (getGuildConfig(guildId).scoutRoleId) {
    setScoutRole(guildId, null);
    await interaction.reply({ content: "✅ Scout role cleared.", flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: "⚠️ **No scout role is set.** Pick one with the role option.", flags: MessageFlags.Ephemeral });
  }
}
