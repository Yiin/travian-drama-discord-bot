import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  User,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { requireAdmin } from "../utils/permissions";
import {
  getLeaderboard,
  getUserStats,
  getVillageStats,
  getAllVillageStats,
  resetStats,
  getLastResetTime,
} from "../services/stats";
import { getVillageAt, getMapLink, getPlayerByExactName, searchPlayersByName } from "../services/map-data";
import { recordContribution } from "../services/stats";
import { getAllPlayers } from "../services/player-accounts";
import { guildCommand, requireGuild } from "./shared";
import { parseCoords } from "../utils/parse-coords";
import { formatNumber } from "../utils/format";
import { errors, cmd, failReply } from "../actions/messages";

export const statsCommand: Command = {
  topic: "info",
  summary: "Defense statistics: leaderboard, per user, per player, per village",
  data: guildCommand("stats", "Defense statistics")
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("Members ranked by troops sent"))
    .addSubcommand((sub) => sub.setName("me").setDescription("Your own troops sent, per village"))
    .addSubcommand((sub) =>
      sub
        .setName("user")
        .setDescription("Troops sent by one member")
        .addUserOption((opt) => opt.setName("user").setDescription("The member").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("player")
        .setDescription("Defense collected by each village of a Travian player")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Exact Travian player name").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("village")
        .setDescription("Who sent defense to one village")
        .addStringOption((opt) =>
          opt.setName("coords").setDescription("Village coordinates, for example 123|456").setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("stacks").setDescription("Villages ranked by defense collected"))
    .addSubcommand((sub) => sub.setName("players").setDescription("Linked accounts with their Discord users and sitters"))
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add or subtract troops in the stats without a request (admin)")
        .addStringOption((opt) =>
          opt.setName("coords").setDescription("Village coordinates, for example 123|456").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("troops").setDescription("Troops to add; negative subtracts").setRequired(true)
        )
        .addUserOption((opt) => opt.setName("for").setDescription("Credit this member instead of yourself"))
    )
    .addSubcommand((sub) => sub.setName("reset").setDescription("Reset all stats for this server (admin)")),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const guildId = interaction.guildId;
    const typed = interaction.options.getFocused().trim();
    const config = guildId ? getGuildConfig(guildId) : {};
    if (!config.serverKey || typed.length < 2) {
      await interaction.respond([]);
      return;
    }
    const players = await searchPlayersByName(config.serverKey, typed, 25);
    await interaction.respond(
      players.map((p) => ({
        name: `${p.playerName} · ${p.villageCount} villages`.slice(0, 100),
        value: p.playerName.slice(0, 100),
      }))
    );
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

    switch (interaction.options.getSubcommand()) {
      case "leaderboard":
        await handleLeaderboard(interaction, guildId);
        break;
      case "me":
        await handleUser(interaction, guildId, interaction.user);
        break;
      case "user":
        await handleUser(interaction, guildId, interaction.options.getUser("user", true));
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
      case "players":
        await handlePlayers(interaction, guildId);
        break;
      case "add":
        if (!(await requireAdmin(interaction))) return;
        await handleAdd(interaction, guildId);
        break;
      case "reset":
        if (!(await requireAdmin(interaction))) return;
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
      content: "⚠️ **No stats recorded yet.**",
      flags: MessageFlags.Ephemeral,
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
  guildId: string,
  user: User
): Promise<void> {
  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  const userStats = getUserStats(guildId, user.id);

  if (!userStats) {
    await interaction.reply({
      content: user.id === interaction.user.id ? "⚠️ **No troops recorded for you yet.**" : `⚠️ **No troops recorded for <@${user.id}> yet.**`,
      flags: MessageFlags.Ephemeral,
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
      ...failReply(errors.notSetUp(), interaction),
      flags: MessageFlags.Ephemeral,
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
      content: errors.invalidCoords(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  const serverKey = config.serverKey;

  const villageStats = getVillageStats(guildId, coords.x, coords.y);

  if (!villageStats) {
    await interaction.reply({
      content: `No stats recorded for (${coords.x}|${coords.y}).`,
      flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
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
    flags: MessageFlags.Ephemeral,
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

async function handlePlayers(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const players = getAllPlayers(guildId);

  if (players.length === 0) {
    await interaction.reply({
      content: `⚠️ **No linked accounts yet.** Link yours with ${cmd("account link")}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = players.map((player) => {
    const owners = player.owners.length > 0 ? player.owners.map((id) => `<@${id}>`).join(", ") : "_no owner_";
    const sitters = player.sitters.length > 0 ? ` (sitters: ${player.sitters.map((id) => `<@${id}>`).join(", ")})` : "";
    return `**${player.name}**: ${owners}${sitters}`;
  });

  // Discord caps messages at 2000 characters; chunk without pinging anyone
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > 1900) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current) chunks.push(current);

  await interaction.reply({ content: chunks[0], allowedMentions: { parse: [] } });
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({ content: chunk, allowedMentions: { parse: [] } });
  }
}

async function handleAdd(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const coords = parseCoords(interaction.options.getString("coords", true));
  const troops = interaction.options.getInteger("troops", true);
  const target = interaction.options.getUser("for") ?? interaction.user;

  if (!coords) {
    await interaction.reply({ content: errors.invalidCoords(), flags: MessageFlags.Ephemeral });
    return;
  }
  if (troops === 0) {
    await interaction.reply({ content: errors.countIsZero("troop"), flags: MessageFlags.Ephemeral });
    return;
  }

  recordContribution(guildId, target.id, coords.x, coords.y, troops);

  const verb = troops > 0 ? "Added" : "Subtracted";
  const preposition = troops > 0 ? "to" : "from";
  await interaction.reply({
    content: `✅ ${verb} **${formatNumber(Math.abs(troops))}** troops ${preposition} (${coords.x}|${coords.y}) stats for <@${target.id}>.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}
