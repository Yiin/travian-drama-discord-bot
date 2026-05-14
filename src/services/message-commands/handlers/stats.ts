import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { CommandContext } from "../types";
import { requireAdminMiddleware } from "../middleware";
import { formatNumber } from "../../../utils/format";
import { parseCoords } from "../../../utils/parse-coords";
import { getGuildConfig } from "../../../config/guild-config";
import {
  getLeaderboard,
  getUserStats,
  getVillageStats,
  getAllVillageStats,
  resetStats,
  getLastResetTime,
} from "../../stats";
import { getVillageAt, getMapLink, getPlayerByExactName } from "../../map-data";

async function handleStatsLeaderboardCommandInner(ctx: CommandContext): Promise<void> {
  const leaderboard = getLeaderboard(ctx.guildId);

  if (leaderboard.length === 0) {
    await ctx.message.reply("No stats have been recorded yet.");
    return;
  }

  const lastReset = getLastResetTime(ctx.guildId);
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

  await ctx.message.reply({ embeds: [embed] });
}

async function handleStatsUserCommandInner(
  ctx: CommandContext,
  userId: string
): Promise<void> {
  const config = getGuildConfig(ctx.guildId);
  const serverKey = config.serverKey;

  const userStats = getUserStats(ctx.guildId, userId);

  if (!userStats) {
    await ctx.message.reply(`<@${userId}> has no recorded contributions.`);
    return;
  }

  // Fetch user info
  let userName = userId;
  let userAvatarUrl: string | undefined;
  try {
    const user = await ctx.client.users.fetch(userId);
    userName = user.displayName;
    userAvatarUrl = user.displayAvatarURL();
  } catch {
    // Use ID if user fetch fails
  }

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
    .setTitle(`Statistika: ${userName}`)
    .setDescription(
      `**Total:** ${formatNumber(userStats.totalTroops)} troops to ${userStats.villages.length} kaimus\n\n${lines.join("\n")}`
    )
    .setColor(0x5865f2);

  if (userAvatarUrl) {
    embed.setThumbnail(userAvatarUrl);
  }

  await ctx.message.reply({ embeds: [embed] });
}

async function handleStatsPlayerCommandInner(
  ctx: CommandContext,
  playerName: string
): Promise<void> {
  const config = getGuildConfig(ctx.guildId);
  const serverKey = config.serverKey;

  if (!serverKey) {
    await ctx.message.reply("Server is not configured. Use `/configure server` first.");
    return;
  }

  const playerData = await getPlayerByExactName(serverKey, playerName);

  if (!playerData) {
    await ctx.message.reply(`Player "${playerName}" was not found.`);
    return;
  }

  const { player, villages } = playerData;
  const lines: string[] = [];
  let totalCollected = 0;

  for (const v of villages) {
    const villageStats = getVillageStats(ctx.guildId, v.x, v.y);
    const collected = villageStats?.totalTroops || 0;
    totalCollected += collected;

    const mapLink = getMapLink(serverKey, v);
    const collectedStr = collected > 0 ? `**${formatNumber(collected)}**` : "0";
    lines.push(`[${v.villageName}](${mapLink}) (${v.x}|${v.y}) │ ${collectedStr}`);
  }

  const allianceStr = player.allianceName ? ` [${player.allianceName}]` : "";

  const embed = new EmbedBuilder()
    .setTitle(`Kaimai: ${player.playerName}${allianceStr}`)
    .setDescription(
      `**Total collected:** ${formatNumber(totalCollected)} troops\n\n${lines.join("\n")}`
    )
    .setFooter({ text: `${villages.length} villages • ${formatNumber(player.totalPopulation)} populiacija` })
    .setColor(0x5865f2);

  await ctx.message.reply({ embeds: [embed] });
}

async function handleStatsVillageCommandInner(
  ctx: CommandContext,
  coordsInput: string
): Promise<void> {
  const coords = parseCoords(coordsInput);
  if (!coords) {
    await ctx.message.reply("Invalid coordinates. Use `123|456` or `-45|89`.");
    return;
  }

  const config = getGuildConfig(ctx.guildId);
  const serverKey = config.serverKey;

  const villageStats = getVillageStats(ctx.guildId, coords.x, coords.y);

  if (!villageStats) {
    await ctx.message.reply(`No stats recorded at coordinates (${coords.x}|${coords.y}).`);
    return;
  }

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
    lines.push(`*...and ${villageStats.contributors.length - 15} more senders*`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Gynyba: ${villageName}${playerInfo}`)
    .setDescription(
      `**Total:** ${formatNumber(villageStats.totalTroops)} troops from ${villageStats.contributors.length} defenders\n\n${lines.join("\n")}`
    )
    .setColor(0x5865f2);

  await ctx.message.reply({ embeds: [embed] });
}

async function handleStatsStacksCommandInner(ctx: CommandContext): Promise<void> {
  const allVillages = getAllVillageStats(ctx.guildId);

  if (allVillages.length === 0) {
    await ctx.message.reply("No stats have been recorded yet.");
    return;
  }

  const config = getGuildConfig(ctx.guildId);
  const serverKey = config.serverKey;

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
    .setTitle("Daugiausiai apginti villages")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `${allVillages.length} villages • ${formatNumber(totalTroops)} total troops` })
    .setColor(0x5865f2);

  await ctx.message.reply({ embeds: [embed] });
}

async function handleStatsResetCommandInner(ctx: CommandContext): Promise<void> {
  const confirmButton = new ButtonBuilder()
    .setCustomId("stats_reset_confirm_msg")
    .setLabel("Yes, clear stats")
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId("stats_reset_cancel_msg")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
    cancelButton
  );

  const response = await ctx.message.reply({
    content: "Are you sure you want to clear all stats? This action cannot be undone.",
    components: [row],
  });

  try {
    const buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === ctx.message.author.id,
      time: 30000,
    });

    if (buttonInteraction.customId === "stats_reset_confirm_msg") {
      resetStats(ctx.guildId);
      await buttonInteraction.update({
        content: "All stats have been cleared.",
        components: [],
      });
    } else {
      await buttonInteraction.update({
        content: "Clear cancelled.",
        components: [],
      });
    }
  } catch {
    // Timeout - remove buttons
    await response.edit({
      content: "Timed out.",
      components: [],
    });
  }
}

// Wrap all with admin checks
export const handleStatsLeaderboardCommand = requireAdminMiddleware(handleStatsLeaderboardCommandInner);
export const handleStatsUserCommand = requireAdminMiddleware(handleStatsUserCommandInner);
export const handleStatsPlayerCommand = requireAdminMiddleware(handleStatsPlayerCommandInner);
export const handleStatsVillageCommand = requireAdminMiddleware(handleStatsVillageCommandInner);
export const handleStatsStacksCommand = requireAdminMiddleware(handleStatsStacksCommandInner);
export const handleStatsResetCommand = requireAdminMiddleware(handleStatsResetCommandInner);
