import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import { Command } from "../types";
import { setServerKey, setDefenseChannel, setScoutChannel, setPushCategory, setScoutRole, getGuildConfig } from "../config/guild-config";
import { updateMapData } from "../services/map-data";
import { withRetry } from "../utils/retry";

function normalizeServerKey(input: string): string {
  let key = input.trim().toLowerCase();

  // Remove protocol if present
  key = key.replace(/^https?:\/\//, "");

  // Remove .travian.com suffix if present
  key = key.replace(/\.travian\.com\/?$/, "");

  // Remove trailing slash
  key = key.replace(/\/+$/, "");

  return key;
}

function isValidServerKey(key: string): boolean {
  // Should be like: ts31.x3.europe or ts5.x1.international
  // Basic validation: should have dots, no spaces, alphanumeric with dots
  return /^[a-z0-9]+(\.[a-z0-9]+)+$/.test(key);
}

export const configureCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("configure")
    .setDescription("Configure bot settings")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("server")
        .setDescription("Configure the Travian gameworld for map lookups")
        .addStringOption((option) =>
          option
            .setName("value")
            .setDescription("The Travian server (e.g., ts31.x3.europe)")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Configure defense or scout request channels")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("The type of channel to configure")
            .setRequired(true)
            .addChoices(
              { name: "Defense", value: "defense" },
              { name: "Scout", value: "scout" }
            )
        )
        .addChannelOption((option) =>
          option
            .setName("value")
            .setDescription("The channel to send requests to")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("push-category")
        .setDescription("Configure the category for push request channels")
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("The category where push channels will be created")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildCategory)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("scoutrole")
        .setDescription("Set or clear the role to mention for scout requests")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The role to mention (leave empty to clear)")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "server") {
      await handleServerConfig(interaction, guildId);
    } else if (subcommand === "channel") {
      await handleChannelConfig(interaction, guildId);
    } else if (subcommand === "push-category") {
      await handlePushCategoryConfig(interaction, guildId);
    } else if (subcommand === "scoutrole") {
      await handleScoutRoleConfig(interaction, guildId);
    }
  },
};

async function handleServerConfig(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const serverInput = interaction.options.getString("value", true);
  const serverKey = normalizeServerKey(serverInput);

  if (!isValidServerKey(serverKey)) {
    await interaction.reply({
      content: "Invalid server. Please provide a valid Travian server (e.g., ts31.x3.europe)",
      ephemeral: true,
    });
    return;
  }

  // Defer reply as download may take time
  await withRetry(() => interaction.deferReply({ ephemeral: true }));

  try {
    // Save the server key (short form)
    setServerKey(guildId, serverKey);

    // Download map data
    await updateMapData(serverKey);

    await interaction.editReply({
      content: `Travian server set to \`${serverKey}\`\nMap data downloaded successfully!`,
    });
  } catch (error) {
    console.error("[Configure] Failed to download map data:", error);
    await interaction.editReply({
      content: `Server saved as \`${serverKey}\`, but failed to download map data. The bot will retry later.`,
    });
  }
}

async function handleChannelConfig(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const type = interaction.options.getString("type", true);
  const channel = interaction.options.getChannel("value", true);

  if (type === "defense") {
    console.log(`[Configure] Setting defense channel for guild ${guildId} to ${channel.id}`);
    setDefenseChannel(guildId, channel.id);
    await interaction.reply({
      content: `Defense requests will now be sent to <#${channel.id}>`,
      ephemeral: true,
    });
  } else if (type === "scout") {
    setScoutChannel(guildId, channel.id);
    await interaction.reply({
      content: `Scout requests will now be sent to <#${channel.id}>`,
      ephemeral: true,
    });
  }
}

async function handlePushCategoryConfig(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const category = interaction.options.getChannel("category", true);

  console.log(`[Configure] Setting push category for guild ${guildId} to ${category.id}`);
  setPushCategory(guildId, category.id);
  await interaction.reply({
    content: `Push request channels will now be created in <#${category.id}>`,
    ephemeral: true,
  });
}

async function handleScoutRoleConfig(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const role = interaction.options.getRole("role");

  if (role) {
    setScoutRole(guildId, role.id);
    await interaction.reply({
      content: `Scout requests will now mention <@&${role.id}>`,
      ephemeral: true,
    });
  } else {
    const config = getGuildConfig(guildId);
    if (config.scoutRoleId) {
      setScoutRole(guildId, null);
      await interaction.reply({
        content: "Scout role mention has been cleared.",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "No scout role is currently configured.",
        ephemeral: true,
      });
    }
  }
}
