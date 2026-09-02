import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  Colors,
  MessageFlags,
  GuildMember,
} from "discord.js";
import { Command } from "../types";
import {
  validatePushConfig,
  executePushRequestAction,
  executePushSentAction,
  executePushDeleteAction,
  executePushCloseAction,
  executePushEditAction,
} from "../actions";
import { executePushEditContributionAction } from "../actions/push-edit-contribution.action";
import { executePushTransferAction } from "../actions/push-transfer.action";
import { getPushLeaderboard, getPlayerPushStats, editGlobalStats, transferGlobalStats } from "../services/push-stats";
import { getPushRequestByChannelId } from "../services/push-requests";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { getGuildConfig } from "../config/guild-config";
import { withRetry } from "../utils/retry";
import { requireAdmin, isAdmin } from "../utils/permissions";
import { guildCommand } from "./shared";
import { formatResources } from "../utils/format";
import { errors } from "../actions/messages";
import { confirmationEdit, asConfirm, channelUrl } from "../actions/messages";

export const pushCommand: Command = {
  topic: "pushes",
  summary: "Resource pushes: one thread per request, report what you sent inside it",
  data: guildCommand("push", "Resource pushes: ask for resources or report what you sent")
    .addSubcommand((sub) =>
      sub
        .setName("request")
        .setDescription("Open a push thread for a village that needs resources")
        .addStringOption((opt) =>
          opt.setName("coords").setDescription("Village coordinates, for example 123|456").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("amount").setDescription("Resources needed in total").setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("sent")
        .setDescription("Report resources you sent (use inside the push thread)")
        .addIntegerOption((opt) =>
          opt.setName("amount").setDescription("Resources you sent").setRequired(true).setMinValue(1)
        )
        .addUserOption((opt) =>
          opt.setName("for").setDescription("Credit another member instead of yourself")
        )
    )
    .addSubcommand((sub) =>
      sub.setName("close").setDescription("Close this push and archive the thread (requester or admin)")
    )
    .addSubcommand((sub) =>
      sub.setName("delete").setDescription("Delete this push and its thread for good (admin, no undo)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Change how many resources this push needs (use inside the thread)")
        .addIntegerOption((opt) =>
          opt.setName("amount").setDescription("New total needed").setRequired(true).setMinValue(1)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("stats")
        .setDescription("Push statistics")
        .addSubcommand((sub) =>
          sub.setName("leaderboard").setDescription("Show players ranked by total resources sent")
        )
        .addSubcommand((sub) =>
          sub
            .setName("player")
            .setDescription("Show stats for a specific player")
            .addStringOption((opt) =>
              opt
                .setName("name")
                .setDescription("In-game player name")
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("edit")
            .setDescription("Edit a player's global stats")
            .addStringOption((opt) =>
              opt
                .setName("player")
                .setDescription("Player's in-game name")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("New total contribution amount")
                .setRequired(true)
                .setMinValue(0)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("transfer")
            .setDescription("Transfer all stats from one player to another")
            .addStringOption((opt) =>
              opt
                .setName("from")
                .setDescription("Source player's in-game name")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((opt) =>
              opt
                .setName("to")
                .setDescription("Target player's in-game name")
                .setRequired(true)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("contributor")
        .setDescription("Manage contributors")
        .addSubcommand((sub) =>
          sub
            .setName("edit")
            .setDescription("Edit a contributor's amount (use in push channel)")
            .addStringOption((opt) =>
              opt
                .setName("player")
                .setDescription("Contributor's in-game name")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("New contribution amount")
                .setRequired(true)
                .setMinValue(0)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("transfer")
            .setDescription("Transfer contribution to another player (use in push channel)")
            .addStringOption((opt) =>
              opt
                .setName("from")
                .setDescription("Source contributor's in-game name")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((opt) =>
              opt
                .setName("to")
                .setDescription("Target player's in-game name")
                .setRequired(true)
            )
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    // Handle stats subcommand group
    if (subcommandGroup === "stats") {
      if (subcommand === "leaderboard") {
        await handleStatsLeaderboard(interaction);
      } else if (subcommand === "player") {
        await handleStatsPlayer(interaction);
      } else if (subcommand === "edit") {
        if (!(await requireAdmin(interaction))) return;
        await handleStatsEdit(interaction);
      } else if (subcommand === "transfer") {
        if (!(await requireAdmin(interaction))) return;
        await handleStatsTransfer(interaction);
      }
      return;
    }

    // Handle contributor subcommand group
    if (subcommandGroup === "contributor") {
      if (subcommand === "edit") {
        await handleContributorEdit(interaction);
      } else if (subcommand === "transfer") {
        await handleContributorTransfer(interaction);
      }
      return;
    }

    // Handle main subcommands
    switch (subcommand) {
      case "request":
        await handleRequest(interaction);
        break;
      case "sent":
        await handleSent(interaction);
        break;
      case "close":
        await handleClose(interaction);
        break;
      case "delete":
        if (!(await requireAdmin(interaction))) return;
        await handleDelete(interaction);
        break;
      case "edit":
        await handleEdit(interaction);
        break;
    }
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);
    const subcommandGroup = interaction.options.getSubcommandGroup(false);

    // Stats group uses global leaderboard for autocomplete
    if (subcommandGroup === "stats" && (focusedOption.name === "name" || focusedOption.name === "player" || focusedOption.name === "from")) {
      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.respond([]);
        return;
      }

      const leaderboard = getPushLeaderboard(guildId);
      const searchValue = focusedOption.value.toLowerCase();

      // Filter and limit to 25 results (Discord's max)
      const filtered = leaderboard
        .filter((entry) => entry.accountName.toLowerCase().includes(searchValue))
        .slice(0, 25)
        .map((entry) => ({
          name: `${entry.accountName} (${formatResources(entry.totalResources)})`,
          value: entry.accountName,
        }));

      await interaction.respond(filtered);
    } else if (subcommandGroup === "contributor" && (focusedOption.name === "player" || focusedOption.name === "from")) {
      // Contributor group uses current push channel contributors
      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.respond([]);
        return;
      }

      const channelId = interaction.channelId;
      const requestData = getPushRequestByChannelId(guildId, channelId);
      if (!requestData) {
        await interaction.respond([]);
        return;
      }

      const searchValue = focusedOption.value.toLowerCase();
      const contributors = requestData.request.contributors;

      // Sort by resources (highest first) and filter
      const filtered = [...contributors]
        .sort((a, b) => b.resources - a.resources)
        .filter((c) => c.accountName.toLowerCase().includes(searchValue))
        .slice(0, 25)
        .map((c) => ({
          name: `${c.accountName} (${formatResources(c.resources)})`,
          value: c.accountName,
        }));

      await interaction.respond(filtered);
    }
  },
};

async function handleRequest(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    return;
  }

  // 2. Parse inputs
  const coordsInput = interaction.options.getString("coords", true);
  const resourcesNeeded = interaction.options.getInteger("amount", true);

  // 3. Defer reply
  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  // 4. Execute action
  const result = await executePushRequestAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      coords: coordsInput,
      resourcesNeeded,
    }
  );

  // 5. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
      actionId: result.actionId,
      panelUrl: result.channelId ? channelUrl(validation.guildId, result.channelId) : undefined,
      panelLabel: "Open thread",
    })
  );
}

async function handleSent(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    return;
  }

  // 2. Get request from channel context
  const channelId = interaction.channelId;
  const requestData = getPushRequestByChannelId(validation.guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: errors.notInThread("push"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 3. Parse inputs
  const resources = interaction.options.getInteger("amount", true);
  const creditUser = interaction.options.getUser("for");

  // 4. Defer reply
  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  // 5. Execute action
  const result = await executePushSentAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      target: requestData.requestId.toString(),
      resources,
      creditUserId: creditUser?.id,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}

/** Close = the requester or an admin removes the request. Archiving arrives in Phase 3. */
async function handleClose(interaction: ChatInputCommandInteraction): Promise<void> {
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    return;
  }
  const requestData = getPushRequestByChannelId(validation.guildId, interaction.channelId);
  if (!requestData) {
    await interaction.reply({ content: errors.notInThread("push"), flags: MessageFlags.Ephemeral });
    return;
  }

  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
  const result = await executePushCloseAction(
    { guildId: validation.guildId, config: validation.config, client: interaction.client, userId: interaction.user.id },
    { requestId: requestData.requestId },
    { isAdmin: isAdmin(interaction.member as GuildMember | null) }
  );
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }
  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}

async function handleDelete(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    return;
  }

  // 2. Get request from channel context
  const channelId = interaction.channelId;
  const requestData = getPushRequestByChannelId(validation.guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: errors.notInThread("push"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 3. Defer reply
  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  // 4. Execute action
  const result = await executePushDeleteAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      requestId: requestData.requestId,
    }
  );

  // 5. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  try {
    await interaction.editReply(confirmationEdit(result.confirmText ?? asConfirm(result.actionText)));
  } catch {
    // the thread was deleted; the reply may already be gone
  }
}

async function handleEdit(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    return;
  }

  // 2. Get request from channel context
  const channelId = interaction.channelId;
  const requestData = getPushRequestByChannelId(validation.guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: errors.notInThread("push"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 3. Parse inputs
  const resourcesNeeded = interaction.options.getInteger("amount", true);

  // 4. Defer reply
  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  // 5. Execute action
  const result = await executePushEditAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      requestId: requestData.requestId,
      resourcesNeeded,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}

async function handleContributorEdit(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    return;
  }

  // 2. Get request from channel context
  const channelId = interaction.channelId;
  const requestData = getPushRequestByChannelId(validation.guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: errors.notInThread("push"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 3. Parse inputs
  const playerName = interaction.options.getString("player", true);
  const newAmount = interaction.options.getInteger("amount", true);

  // 4. Defer reply
  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  // 5. Execute action
  const result = await executePushEditContributionAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      requestId: requestData.requestId,
      accountName: playerName,
      newAmount,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}

async function handleContributorTransfer(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    return;
  }

  // 2. Get request from channel context
  const channelId = interaction.channelId;
  const requestData = getPushRequestByChannelId(validation.guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: errors.notInThread("push"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 3. Parse inputs
  const fromAccount = interaction.options.getString("from", true);
  const toAccount = interaction.options.getString("to", true);

  // 4. Defer reply
  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  // 5. Execute action
  const result = await executePushTransferAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      requestId: requestData.requestId,
      fromAccount,
      toAccount,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}

async function handleStatsLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
    return;
  }

  await withRetry(() => interaction.deferReply());

  const leaderboard = getPushLeaderboard(guildId);

  if (leaderboard.length === 0) {
    await interaction.editReply({ content: "No push stats." });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Push Leaderboard")
    .setColor(Colors.Gold)
    .setTimestamp();

  const lines: string[] = [];
  for (let i = 0; i < Math.min(leaderboard.length, 15); i++) {
    const entry = leaderboard[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
    lines.push(
      `${medal} **${entry.accountName}** - ${formatResources(entry.totalResources)} (${entry.villageCount} villages)`
    );
  }

  embed.setDescription(lines.join("\n"));

  await interaction.editReply({ embeds: [embed] });
}

async function handleStatsPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
    return;
  }

  const playerName = interaction.options.getString("name", true);

  await withRetry(() => interaction.deferReply());

  const stats = getPlayerPushStats(guildId, playerName);

  if (!stats) {
    await interaction.editReply({ content: `No push stats for player **${playerName}**.` });
    return;
  }

  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle(`Push stats: ${stats.accountName}`)
    .setColor(Colors.Gold)
    .setTimestamp();

  const lines: string[] = [];
  lines.push(`**Total sent:** ${formatResources(stats.totalResources)}`);
  lines.push("");
  lines.push("**Villages:**");

  for (const village of stats.villages.slice(0, 10)) {
    let villageLine = `(${village.x}|${village.y})`;
    if (config.serverKey) {
      const villageInfo = await getVillageAt(config.serverKey, village.x, village.y);
      if (villageInfo) {
        villageLine = formatVillageDisplay(config.serverKey, villageInfo);
      }
    }
    lines.push(`• ${villageLine} - ${formatResources(village.resources)}`);
  }

  if (stats.villages.length > 10) {
    lines.push(`... and ${stats.villages.length - 10} villages`);
  }

  embed.setDescription(lines.join("\n"));

  await interaction.editReply({ embeds: [embed] });
}

async function handleStatsEdit(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
    return;
  }

  const playerName = interaction.options.getString("player", true);
  const newAmount = interaction.options.getInteger("amount", true);

  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  const result = editGlobalStats(guildId, playerName, newAmount);

  if (!result.success) {
    await interaction.editReply({ content: result.error! });
    return;
  }

  const oldAmount = result.previousAmount!;
  await interaction.editReply({
    content: `✅ Changed **${playerName}** global stats: **${formatResources(oldAmount)}** → **${formatResources(newAmount)}**.`,
  });
}

async function handleStatsTransfer(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
    return;
  }

  const fromAccount = interaction.options.getString("from", true);
  const toAccount = interaction.options.getString("to", true);

  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  const result = transferGlobalStats(guildId, fromAccount, toAccount);

  if (!result.success) {
    await interaction.editReply({ content: result.error! });
    return;
  }

  await interaction.editReply({
    content: `✅ Transferred **${fromAccount}** stats to **${toAccount}** (**${formatResources(result.transferredAmount!)}**).`,
  });
}

