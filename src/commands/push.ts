import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { Command } from "../types";
import {
  validatePushConfig,
  executePushRequestAction,
  executePushSentAction,
  executePushDeleteAction,
  executePushEditAction,
} from "../actions";
import { getPushLeaderboard, getPlayerPushStats } from "../services/push-stats";
import { getVillageAt, formatVillageDisplay } from "../services/map-data";
import { getGuildConfig } from "../config/guild-config";
import { withRetry } from "../utils/retry";

export const pushCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("push")
    .setDescription("Resource push coordination")
    .addSubcommand((sub) =>
      sub
        .setName("request")
        .setDescription("Create a push request")
        .addStringOption((opt) =>
          opt
            .setName("coords")
            .setDescription("Coordinates (e.g., 123|456)")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Resources needed")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("sent")
        .setDescription("Report resources sent")
        .addIntegerOption((opt) =>
          opt
            .setName("index")
            .setDescription("Push request index")
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Resources sent")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a push request")
        .addIntegerOption((opt) =>
          opt
            .setName("index")
            .setDescription("Push request index")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edit push request amount")
        .addIntegerOption((opt) =>
          opt
            .setName("index")
            .setDescription("Push request index")
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("New resource amount needed")
            .setRequired(true)
            .setMinValue(1)
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
      case "delete":
        await handleDelete(interaction);
        break;
      case "edit":
        await handleEdit(interaction);
        break;
    }
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === "name") {
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
          name: `${entry.accountName} (${formatNumber(entry.totalResources)})`,
          value: entry.accountName,
        }));

      await interaction.respond(filtered);
    }
  },
};

async function handleRequest(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Parse inputs
  const coordsInput = interaction.options.getString("coords", true);
  const resourcesNeeded = interaction.options.getInteger("amount", true);

  // 3. Defer reply
  await withRetry(() => interaction.deferReply());

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

  await interaction.editReply({ content: result.actionText });
}

async function handleSent(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Parse inputs
  const requestId = interaction.options.getInteger("index", true);
  const resources = interaction.options.getInteger("amount", true);

  // 3. Defer reply
  await withRetry(() => interaction.deferReply());

  // 4. Execute action
  const result = await executePushSentAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      target: requestId.toString(),
      resources,
    }
  );

  // 5. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  // Delete reply since info is shown in global message
  await interaction.deleteReply();
}

async function handleDelete(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Parse inputs
  const requestId = interaction.options.getInteger("index", true);

  // 3. Defer reply
  await withRetry(() => interaction.deferReply());

  // 4. Execute action
  const result = await executePushDeleteAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      requestId,
    }
  );

  // 5. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply({ content: result.actionText });
}

async function handleEdit(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Parse inputs
  const requestId = interaction.options.getInteger("index", true);
  const resourcesNeeded = interaction.options.getInteger("amount", true);

  // 3. Defer reply
  await withRetry(() => interaction.deferReply());

  // 4. Execute action
  const result = await executePushEditAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      requestId,
      resourcesNeeded,
    }
  );

  // 5. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply({ content: result.actionText });
}

async function handleStatsLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "Ši komanda veikia tik serveryje.", ephemeral: true });
    return;
  }

  await withRetry(() => interaction.deferReply());

  const leaderboard = getPushLeaderboard(guildId);

  if (leaderboard.length === 0) {
    await interaction.editReply({ content: "Nėra push statistikos." });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Push Lyderių Lentelė")
    .setColor(Colors.Gold)
    .setTimestamp();

  const lines: string[] = [];
  for (let i = 0; i < Math.min(leaderboard.length, 15); i++) {
    const entry = leaderboard[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
    lines.push(
      `${medal} **${entry.accountName}** - ${formatNumber(entry.totalResources)} (${entry.villageCount} kaimai)`
    );
  }

  embed.setDescription(lines.join("\n"));

  await interaction.editReply({ embeds: [embed] });
}

async function handleStatsPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "Ši komanda veikia tik serveryje.", ephemeral: true });
    return;
  }

  const playerName = interaction.options.getString("name", true);

  await withRetry(() => interaction.deferReply());

  const stats = getPlayerPushStats(guildId, playerName);

  if (!stats) {
    await interaction.editReply({ content: `Nėra push statistikos žaidėjui **${playerName}**.` });
    return;
  }

  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle(`Push statistika: ${stats.accountName}`)
    .setColor(Colors.Gold)
    .setTimestamp();

  const lines: string[] = [];
  lines.push(`**Iš viso išsiųsta:** ${formatNumber(stats.totalResources)}`);
  lines.push("");
  lines.push("**Kaimai:**");

  for (const village of stats.villages.slice(0, 10)) {
    let villageLine = `(${village.x}|${village.y})`;
    if (config.serverKey) {
      const villageInfo = await getVillageAt(config.serverKey, village.x, village.y);
      if (villageInfo) {
        villageLine = formatVillageDisplay(config.serverKey, villageInfo);
      }
    }
    lines.push(`• ${villageLine} - ${formatNumber(village.resources)}`);
  }

  if (stats.villages.length > 10) {
    lines.push(`... ir dar ${stats.villages.length - 10} kaimai`);
  }

  embed.setDescription(lines.join("\n"));

  await interaction.editReply({ embeds: [embed] });
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}
