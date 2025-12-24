import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import {
  getLeaderboard,
  getUserStats,
  getVillageStats,
  getAllVillageStats,
  resetStats,
  getLastResetTime,
} from "../services/stats";
import { getVillageAt, getMapLink, getPlayerByExactName } from "../services/map-data";
import { parseCoords } from "../utils/parse-coords";
import { formatNumber } from "../utils/format";

export const statsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View defense statistics")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show users ranked by total troops sent")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("Show stats for a specific user")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to show stats for")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("player")
        .setDescription("Show stats for villages owned by a Travian player")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("The exact Travian player name")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("village")
        .setDescription("Show stats for a specific village")
        .addStringOption((option) =>
          option
            .setName("coords")
            .setDescription("Village coordinates (e.g., 123|456 or -45|89)")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stacks")
        .setDescription("Show villages ranked by total defense collected")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset all stats for this server")
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

    // Check administrator permission
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: "This command requires Administrator permission.",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "leaderboard":
        await handleLeaderboard(interaction, guildId);
        break;
      case "user":
        await handleUser(interaction, guildId);
        break;
      case "player":
        await handlePlayer(interaction, guildId);
        break;
      case "village":
        await handleVillage(interaction, guildId);
        break;
      case "stacks":
        await handleStacks(interaction, guildId);
        break;
      case "reset":
        await handleReset(interaction, guildId);
        break;
    }
  },
};

async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const leaderboard = getLeaderboard(guildId);

  if (leaderboard.length === 0) {
    await interaction.reply({
      content: "No stats recorded yet.",
      ephemeral: true,
    });
    return;
  }

  const lastReset = getLastResetTime(guildId);
  const resetDate = new Date(lastReset).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  const top15 = leaderboard.slice(0, 15);

  for (let i = 0; i < top15.length; i++) {
    const entry = top15[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    lines.push(
      `${medal} <@${entry.userId}> │ **${formatNumber(entry.totalTroops)}** troops (${entry.villageCount} villages)`
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("Defense Leaderboard")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Stats since ${resetDate}` })
    .setColor(0x5865f2);

  await interaction.reply({ embeds: [embed] });
}

async function handleUser(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const user = interaction.options.getUser("user", true);
  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  const userStats = getUserStats(guildId, user.id);

  if (!userStats) {
    await interaction.reply({
      content: `<@${user.id}> has no recorded contributions.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const lines: string[] = [];

  for (const v of userStats.villages.slice(0, 15)) {
    let villageName = `(${v.x}|${v.y})`;

    if (serverKey) {
      const village = await getVillageAt(serverKey, v.x, v.y);
      if (village) {
        const mapLink = getMapLink(serverKey, v);
        villageName = `[${village.villageName}](${mapLink}) (${v.x}|${v.y})`;
      }
    }

    lines.push(`${villageName} │ **${formatNumber(v.troops)}**`);
  }

  if (userStats.villages.length > 15) {
    lines.push(`*...and ${userStats.villages.length - 15} more villages*`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Stats for ${user.displayName}`)
    .setDescription(
      `**Total:** ${formatNumber(userStats.totalTroops)} troops across ${userStats.villages.length} villages\n\n${lines.join("\n")}`
    )
    .setColor(0x5865f2)
    .setThumbnail(user.displayAvatarURL());

  await interaction.editReply({ embeds: [embed] });
}

async function handlePlayer(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const playerName = interaction.options.getString("name", true);
  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  if (!serverKey) {
    await interaction.reply({
      content: "Server not configured. Use `/configure server` first.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const playerData = await getPlayerByExactName(serverKey, playerName);

  if (!playerData) {
    await interaction.editReply({
      content: `Player "${playerName}" not found.`,
    });
    return;
  }

  const { player, villages } = playerData;
  const lines: string[] = [];
  let totalCollected = 0;

  for (const v of villages) {
    const villageStats = getVillageStats(guildId, v.x, v.y);
    const collected = villageStats?.totalTroops || 0;
    totalCollected += collected;

    const mapLink = getMapLink(serverKey, v);
    const collectedStr = collected > 0 ? `**${formatNumber(collected)}**` : "0";
    lines.push(`[${v.villageName}](${mapLink}) (${v.x}|${v.y}) │ ${collectedStr}`);
  }

  const allianceStr = player.allianceName ? ` [${player.allianceName}]` : "";

  const embed = new EmbedBuilder()
    .setTitle(`Villages of ${player.playerName}${allianceStr}`)
    .setDescription(
      `**Total collected:** ${formatNumber(totalCollected)} troops\n\n${lines.join("\n")}`
    )
    .setFooter({ text: `${villages.length} villages • ${formatNumber(player.totalPopulation)} population` })
    .setColor(0x5865f2);

  await interaction.editReply({ embeds: [embed] });
}

async function handleVillage(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const coordsInput = interaction.options.getString("coords", true);
  const coords = parseCoords(coordsInput);

  if (!coords) {
    await interaction.reply({
      content: "Invalid coordinates. Use format like `123|456` or `-45|89`.",
      ephemeral: true,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  const villageStats = getVillageStats(guildId, coords.x, coords.y);

  if (!villageStats) {
    await interaction.reply({
      content: `No stats recorded for (${coords.x}|${coords.y}).`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  let villageName = `(${coords.x}|${coords.y})`;
  let playerInfo = "";

  if (serverKey) {
    const village = await getVillageAt(serverKey, coords.x, coords.y);
    if (village) {
      villageName = village.villageName;
      playerInfo = ` (${village.playerName})`;
    }
  }

  const lines: string[] = [];

  for (const c of villageStats.contributors.slice(0, 15)) {
    lines.push(`<@${c.userId}> │ **${formatNumber(c.troops)}**`);
  }

  if (villageStats.contributors.length > 15) {
    lines.push(`*...and ${villageStats.contributors.length - 15} more contributors*`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Defense at ${villageName}${playerInfo}`)
    .setDescription(
      `**Total:** ${formatNumber(villageStats.totalTroops)} troops from ${villageStats.contributors.length} defenders\n\n${lines.join("\n")}`
    )
    .setColor(0x5865f2);

  await interaction.editReply({ embeds: [embed] });
}

async function handleStacks(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const allVillages = getAllVillageStats(guildId);

  if (allVillages.length === 0) {
    await interaction.reply({
      content: "No stats recorded yet.",
      ephemeral: true,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  await interaction.deferReply();

  const lines: string[] = [];
  const top15 = allVillages.slice(0, 15);

  for (let i = 0; i < top15.length; i++) {
    const v = top15[i];
    let villageName = `(${v.x}|${v.y})`;

    if (serverKey) {
      const village = await getVillageAt(serverKey, v.x, v.y);
      if (village) {
        const mapLink = getMapLink(serverKey, v);
        villageName = `[${village.villageName}](${mapLink}) (${v.x}|${v.y})`;
      }
    }

    const rank = i + 1;
    lines.push(
      `${rank}. ${villageName} │ **${formatNumber(v.totalTroops)}** (${v.contributorCount} senders)`
    );
  }

  if (allVillages.length > 15) {
    lines.push(`\n*...and ${allVillages.length - 15} more villages*`);
  }

  const totalTroops = allVillages.reduce((sum, v) => sum + v.totalTroops, 0);

  const embed = new EmbedBuilder()
    .setTitle("Most Defended Villages")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `${allVillages.length} villages • ${formatNumber(totalTroops)} total troops` })
    .setColor(0x5865f2);

  await interaction.editReply({ embeds: [embed] });
}

async function handleReset(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const confirmButton = new ButtonBuilder()
    .setCustomId("stats_reset_confirm")
    .setLabel("Yes, reset all stats")
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId("stats_reset_cancel")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
    cancelButton
  );

  const response = await interaction.reply({
    content: "Are you sure you want to reset all stats? This cannot be undone.",
    components: [row],
    ephemeral: true,
  });

  try {
    const buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30000,
    });

    if (buttonInteraction.customId === "stats_reset_confirm") {
      resetStats(guildId);
      await buttonInteraction.update({
        content: "All stats have been reset.",
        components: [],
      });
    } else {
      await buttonInteraction.update({
        content: "Reset cancelled.",
        components: [],
      });
    }
  } catch {
    // Timeout - remove buttons
    await interaction.editReply({
      content: "Reset timed out.",
      components: [],
    });
  }
}
