import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig, getAllConfiguredServers, getScopeConfig } from "../config/guild-config";
import { mainScope, resolveScope, Scope, scopeOfChannel } from "../config/scope";
import { withRetry } from "../utils/retry";
import { normalizeServerKey, isValidServerKey } from "../utils/server-key";
import { filterChoices } from "../utils/choices";
import { ChannelKind } from "../actions/messages";
import {
  applyAddConfed,
  applyChannel,
  applyRemoveConfed,
  applyScoutRole,
  applyServerKey,
  applyTimezone,
} from "../actions/setup.action";
import { buildSetupSummary, setupPanelPayload } from "../services/setup-panel";
import { guildCommand, requireGuild } from "./shared";
import { requireAdmin } from "../utils/permissions";

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
    .addSubcommand((sub) =>
      sub.setName("panel").setDescription("Open the setup panel; inside a confed's category, that confed's panel")
    )
    .addSubcommandGroup((group) =>
      group
        .setName("confed")
        .setDescription("Give each confed in this server its own channels")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Add a confed: commands in its category use its own channels")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("Confed name, for example BBCTM").setRequired(true).setMaxLength(40)
            )
            .addChannelOption((opt) =>
              opt
                .setName("category")
                .setDescription("The category that holds this confed's channels")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildCategory)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Remove a confed; its category goes back to the main confed")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("The confed").setRequired(true).setAutocomplete(true)
            )
        )
    ),

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

    if (sub === "remove" && interaction.guildId) {
      const confeds = getGuildConfig(interaction.guildId).confeds ?? [];
      await interaction.respond(filterChoices(confeds.map((c) => ({ name: c.name, value: c.id })), typed));
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
    // Same gate as the panel; default_member_permissions only hides the command
    if (!(await requireAdmin(interaction))) return;

    if (interaction.options.getSubcommandGroup(false) === "confed") {
      if (interaction.options.getSubcommand() === "add") await handleConfedAdd(interaction, guildId);
      else await handleConfedRemove(interaction, guildId);
      return;
    }

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
        await interaction.reply({
          content: buildSetupSummary(guildId),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      case "panel": {
        const scope = (await resolveScope(interaction)) ?? mainScope(guildId);
        await interaction.reply({ ...setupPanelPayload(scope), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        return;
      }
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

/** The channel's category decides which confed it is for. */
async function handleChannel(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const type = interaction.options.getString("type", true) as ChannelKind;
  const channel = interaction.options.getChannel("value", true);
  const scope = await scopeOfChannel(interaction.client, guildId, channel.id);
  const result = await applyChannel(interaction.client, scope, type, channel.id);
  await interaction.reply({ content: result.ok ? result.text : result.error, flags: MessageFlags.Ephemeral });
}

async function handleTimezone(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const result = applyTimezone(guildId, interaction.options.getString("value", true));
  await interaction.reply({ content: result.ok ? result.text : result.error, flags: MessageFlags.Ephemeral });
}

/** Sets the scout role of the confed whose category this runs in. */
async function handleScoutRole(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const role = interaction.options.getRole("role");
  const scope: Scope = (await resolveScope(interaction)) ?? mainScope(guildId);

  if (!role && !getScopeConfig(scope).scoutRoleId) {
    await interaction.reply({ content: "⚠️ **No scout role is set.** Pick one with the role option.", flags: MessageFlags.Ephemeral });
    return;
  }
  const result = applyScoutRole(scope, role?.id ?? null);
  await interaction.reply({ content: result.ok ? result.text : result.error, flags: MessageFlags.Ephemeral });
}

async function handleConfedAdd(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const name = interaction.options.getString("name", true);
  const category = interaction.options.getChannel("category", true);
  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
  const result = await applyAddConfed(interaction.client, guildId, name, category.id);
  if (!result.ok) {
    await interaction.editReply({ content: result.error });
    return;
  }
  await interaction.editReply({ content: result.text });
  await interaction.followUp({
    ...setupPanelPayload({ guildId, confedId: result.confed.id }),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function handleConfedRemove(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const result = applyRemoveConfed(guildId, interaction.options.getString("name", true));
  await interaction.reply({ content: result.ok ? result.text : result.error, flags: MessageFlags.Ephemeral });
}
