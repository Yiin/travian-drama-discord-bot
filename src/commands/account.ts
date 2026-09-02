import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  TextChannel,
  MessageFlags,
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
import { postAccountReminder } from "../services/account-reminder-message";
import { requireAdmin } from "../utils/permissions";
import { ARROW } from "../utils/format";
import { filterChoices } from "../utils/choices";
import { guildCommand, requireGuild } from "./shared";

export const accountCommand: Command = {
  topic: "you",
  summary: "Link your Discord user to your in-game account",
  data: guildCommand("account", "Link your Discord user to your in-game account")
    .addSubcommand((sub) =>
      sub
        .setName("link")
        .setDescription("Link an in-game account to yourself, or to another member")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("In-game player name").setRequired(true).setMaxLength(50)
        )
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Link the account to this member instead of yourself")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlink")
        .setDescription("Remove the link between a Discord user and an in-game account")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Unlink this member instead of yourself")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("rename")
        .setDescription("Rename an in-game account everywhere it is stored (admin)")
        .addStringOption((opt) =>
          opt.setName("old").setDescription("Current in-game name").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt.setName("new").setDescription("New in-game name").setRequired(true).setMaxLength(50)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reminder")
        .setDescription("Post the account-link reminder with Add / Not playing buttons here (admin)")
    ),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.respond([]);
      return;
    }
    const choices = getAllPlayers(guildId).map((p) => ({ name: p.name, value: p.name }));
    await interaction.respond(filterChoices(choices, interaction.options.getFocused()));
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

    switch (interaction.options.getSubcommand()) {
      case "link":
        await handleLink(interaction, guildId);
        return;
      case "unlink":
        await handleUnlink(interaction, guildId);
        return;
      case "rename":
        if (!(await requireAdmin(interaction))) return;
        await handleRename(interaction, guildId);
        return;
      case "reminder":
        if (!(await requireAdmin(interaction))) return;
        await handlePostReminder(interaction, guildId);
        return;
    }
  },
};

async function handleLink(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const inGameName = interaction.options.getString("name", true).trim();
  const targetUser = interaction.options.getUser("user");
  const userId = targetUser?.id ?? interaction.user.id;
  const isSelf = userId === interaction.user.id;

  if (!inGameName) {
    await interaction.reply({ content: "⚠️ **Enter a valid in-game name.**", flags: MessageFlags.Ephemeral });
    return;
  }

  const previousName = getAccountForUser(guildId, userId);
  setAccount(guildId, userId, inGameName);

  const who = isSelf ? "You are" : `<@${userId}> is`;
  let content: string;
  if (previousName === inGameName) {
    content = `✅ ${who} already linked to **${inGameName}**.`;
  } else if (previousName) {
    content = `✅ ${who} now linked to **${inGameName}** (was **${previousName}**).`;
  } else {
    content = `✅ ${who} now linked to **${inGameName}**.`;
  }
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function handleUnlink(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const targetUser = interaction.options.getUser("user");
  const userId = targetUser?.id ?? interaction.user.id;
  const isSelf = userId === interaction.user.id;
  const previousName = getAccountForUser(guildId, userId);

  if (!previousName) {
    await interaction.reply({
      content: isSelf ? "⚠️ **You have no linked in-game account.**" : `⚠️ **<@${userId}> has no linked in-game account.**`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  deleteAccount(guildId, userId);
  await interaction.reply({
    content: isSelf ? `✅ Unlinked **${previousName}**.` : `✅ Unlinked **${previousName}** from <@${userId}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRename(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const oldName = interaction.options.getString("old", true).trim();
  const newName = interaction.options.getString("new", true).trim();

  if (!oldName || !newName) {
    await interaction.reply({ content: "⚠️ **Enter both names.**", flags: MessageFlags.Ephemeral });
    return;
  }
  if (oldName === newName) {
    await interaction.reply({ content: "⚠️ **Old and new names are the same.**", flags: MessageFlags.Ephemeral });
    return;
  }

  const accountRenamed = renameAccount(guildId, oldName, newName);
  const pushUpdates = renameAccountInPushRequests(guildId, oldName, newName);
  const statsUpdates = renameAccountInPushStats(guildId, oldName, newName);

  if (!accountRenamed && pushUpdates === 0 && statsUpdates === 0) {
    await interaction.reply({ content: `⚠️ **Account ${oldName} not found.**`, flags: MessageFlags.Ephemeral });
    return;
  }

  const parts = [`✅ Renamed **${oldName}** ${ARROW} **${newName}**.`];
  if (accountRenamed) parts.push("• Player link updated");
  if (pushUpdates > 0) parts.push(`• ${pushUpdates} push request reference(s) updated`);
  if (statsUpdates > 0) parts.push(`• ${statsUpdates} push stats record(s) updated`);

  await interaction.reply({ content: parts.join("\n"), flags: MessageFlags.Ephemeral });
}

async function handlePostReminder(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const channel = interaction.channel;
  if (!channel || !(channel instanceof TextChannel)) {
    await interaction.reply({ content: "⚠️ **Run this in a text channel.**", flags: MessageFlags.Ephemeral });
    return;
  }
  await postAccountReminder(interaction.client, guildId, channel);
  await interaction.reply({ content: "✅ Reminder posted.", flags: MessageFlags.Ephemeral });
}
