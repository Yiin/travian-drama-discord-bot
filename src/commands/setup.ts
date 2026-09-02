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
  setScoutRole,
} from "../config/guild-config";
import { withRetry } from "../utils/retry";
import { normalizeServerKey, isValidServerKey } from "../services/message-commands/utils";
import { filterChoices } from "../utils/choices";
import { ChannelKind } from "../actions/messages";
import { applyChannel, applyServerKey, applyTimezone } from "../actions/setup.action";
import { buildSetupSummary, setupPanelPayload } from "../services/setup-panel";
import { guildCommand, requireGuild } from "./shared";

export { buildSetupSummary };

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
    .addSubcommand((sub) => sub.setName("show").setDescription("Show the current setup"))
    .addSubcommand((sub) => sub.setName("panel").setDescription("Open the setup panel with channel pickers")),

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
      case "panel":
        await interaction.reply({ ...setupPanelPayload(guildId), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        return;
    }
  },
};

async function handleServer(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const raw = interaction.options.getString("value", true);
  if (!isValidServerKey(normalizeServerKey(raw))) {
    const invalid = await applyServerKey(guildId, raw); // returns the error without saving
    await interaction.reply({ content: invalid.ok ? invalid.text : invalid.error, flags: MessageFlags.Ephemeral });
    return;
  }

  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
  const result = await applyServerKey(guildId, raw);
  await interaction.editReply({ content: result.ok ? result.text : result.error });
}

async function handleChannel(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const type = interaction.options.getString("type", true) as ChannelKind;
  const channel = interaction.options.getChannel("value", true);
  const result = applyChannel(guildId, type, channel.id);
  await interaction.reply({ content: result.ok ? result.text : result.error, flags: MessageFlags.Ephemeral });
}

async function handleTimezone(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const result = applyTimezone(guildId, interaction.options.getString("value", true));
  await interaction.reply({ content: result.ok ? result.text : result.error, flags: MessageFlags.Ephemeral });
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
