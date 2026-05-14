import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import { Command } from "../types";
import {
  setAccount,
  deleteAccount,
  getAccountForUser,
  renameAccount,
  getAllPlayers,
} from "../services/player-accounts";
import { renameAccountInPushRequests } from "../services/push-requests";
import { renameAccountInPushStats } from "../services/push-stats";
import {
  getGuildConfig,
  setAccountReminderMessage,
} from "../config/guild-config";
import {
  ACCOUNT_REMINDER_ADD_BUTTON_ID,
  ACCOUNT_REMINDER_SKIP_BUTTON_ID,
} from "../services/button-handlers/index";
import { requireAdmin } from "../utils/permissions";

export const accountCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("account")
    .setDescription("Manage in-game account associations")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set in-game player name for yourself or another user")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("In-game player name")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Discord user to set account for (optional, defaults to yourself)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("del")
        .setDescription("Remove your in-game account association")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reminder")
        .setDescription(
          "Post a singleton message with Add / Not playing buttons (admin)"
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rename")
        .setDescription("Rename a player's in-game account name")
        .addStringOption((option) =>
          option
            .setName("old")
            .setDescription("Current in-game account name")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("new")
            .setDescription("New in-game account name")
            .setRequired(true)
        )
    ),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const focusedValue = interaction.options.getFocused().toLowerCase();
    const players = getAllPlayers(guildId);

    const filtered = players
      .filter((p) => p.name.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map((p) => ({ name: p.name, value: p.name }));

    await interaction.respond(filtered);
  },

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

    if (subcommand === "set") {
      await handleSetAccount(interaction, guildId);
    } else if (subcommand === "del") {
      await handleDeleteAccount(interaction, guildId);
    } else if (subcommand === "rename") {
      await handleRenameAccount(interaction, guildId);
    } else if (subcommand === "reminder") {
      await handlePostReminder(interaction, guildId);
    }
  },
};

async function handlePostReminder(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;

  const channel = interaction.channel;
  if (!channel || !(channel instanceof TextChannel)) {
    await interaction.reply({
      content: "Use this command in a text channel.",
      ephemeral: true,
    });
    return;
  }

  const addButton = new ButtonBuilder()
    .setCustomId(ACCOUNT_REMINDER_ADD_BUTTON_ID)
    .setLabel("Add")
    .setStyle(ButtonStyle.Primary);

  const skipButton = new ButtonBuilder()
    .setCustomId(ACCOUNT_REMINDER_SKIP_BUTTON_ID)
    .setLabel("Not playing")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    addButton,
    skipButton
  );

  const content =
    "**Link your Discord account to your in-game account**\n" +
    "Press **Add** to enter your player name.\n" +
    "Press **Not playing** if you are not playing this server.";

  // Delete previous singleton message if it exists
  const config = getGuildConfig(guildId);
  if (config.accountReminderChannelId && config.accountReminderMessageId) {
    try {
      const oldChannel = (await interaction.client.channels.fetch(
        config.accountReminderChannelId
      )) as TextChannel | null;
      if (oldChannel) {
        const oldMessage = await oldChannel.messages.fetch(
          config.accountReminderMessageId
        );
        await oldMessage.delete();
      }
    } catch {
      // Old message already gone, ignore
    }
  }

  const message = await channel.send({ content, components: [row] });
  setAccountReminderMessage(guildId, channel.id, message.id);

  await interaction.reply({
    content: "Reminder posted.",
    ephemeral: true,
  });
}

async function handleSetAccount(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const inGameName = interaction.options.getString("name", true).trim();
  const targetUser = interaction.options.getUser("user");
  const userId = targetUser?.id ?? interaction.user.id;
  const isSelf = userId === interaction.user.id;

  if (!inGameName) {
    await interaction.reply({
      content: "Please provide a valid in-game name.",
      ephemeral: true,
    });
    return;
  }

  const previousName = getAccountForUser(guildId, userId);
  setAccount(guildId, userId, inGameName);

  if (isSelf) {
    if (previousName && previousName !== inGameName) {
      await interaction.reply({
        content: `Updated your account from **${previousName}** to **${inGameName}**.`,
        ephemeral: true,
      });
    } else if (previousName === inGameName) {
      await interaction.reply({
        content: `You are already associated with **${inGameName}**.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `You are now associated with in-game account **${inGameName}**.`,
        ephemeral: true,
      });
    }
  } else {
    if (previousName && previousName !== inGameName) {
      await interaction.reply({
        content: `Updated <@${userId}> account from **${previousName}** to **${inGameName}**.`,
        ephemeral: true,
      });
    } else if (previousName === inGameName) {
      await interaction.reply({
        content: `<@${userId}> is already associated with **${inGameName}**.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `<@${userId}> is now associated with in-game account **${inGameName}**.`,
        ephemeral: true,
      });
    }
  }
}

async function handleDeleteAccount(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const userId = interaction.user.id;
  const previousName = getAccountForUser(guildId, userId);

  if (!previousName) {
    await interaction.reply({
      content: "You don't have an in-game account associated.",
      ephemeral: true,
    });
    return;
  }

  deleteAccount(guildId, userId);
  await interaction.reply({
    content: `Removed your association with **${previousName}**.`,
    ephemeral: true,
  });
}

async function handleRenameAccount(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const oldName = interaction.options.getString("old", true).trim();
  const newName = interaction.options.getString("new", true).trim();

  if (!oldName || !newName) {
    await interaction.reply({
      content: "Please provide valid account names.",
      ephemeral: true,
    });
    return;
  }

  if (oldName === newName) {
    await interaction.reply({
      content: "Old and new names are the same.",
      ephemeral: true,
    });
    return;
  }

  // Rename in player accounts
  const accountRenamed = renameAccount(guildId, oldName, newName);

  // Rename in push requests
  const pushUpdates = renameAccountInPushRequests(guildId, oldName, newName);

  // Rename in push stats
  const statsUpdates = renameAccountInPushStats(guildId, oldName, newName);

  if (!accountRenamed && pushUpdates === 0 && statsUpdates === 0) {
    await interaction.reply({
      content: `Account **${oldName}** not found.`,
      ephemeral: true,
    });
    return;
  }

  const parts: string[] = [];
  parts.push(`Renamed **${oldName}** → **${newName}**`);

  if (accountRenamed) {
    parts.push("• Updated player account");
  }
  if (pushUpdates > 0) {
    parts.push(`• Updated ${pushUpdates} push request reference(s)`);
  }
  if (statsUpdates > 0) {
    parts.push(`• Updated ${statsUpdates} push stats record(s)`);
  }

  await interaction.reply({
    content: parts.join("\n"),
    ephemeral: true,
  });
}
