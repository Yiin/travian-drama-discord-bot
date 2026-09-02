import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../types";
import {
  addReminder,
  deleteReminder,
  getRemindersForGuild,
  getNextFireTime,
  parseTime,
} from "../services/reminder-scheduler";
import { withRetry } from "../utils/retry";
import { requireAdmin } from "../utils/permissions";
import { errors } from "../actions/messages";
import { guildCommand } from "./shared";

export const reminderCommand: Command = {
  topic: "admin",
  summary: "Repeating reminders posted to a channel",
  data: guildCommand("reminder", "Repeating reminders posted to this channel (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a new repeating reminder")
        .addStringOption((option) =>
          option
            .setName("text")
            .setDescription("The message to repeat")
            .setRequired(true)
            .setMaxLength(2000)
        )
        .addIntegerOption((option) =>
          option
            .setName("every")
            .setDescription("Interval in minutes (e.g., 240 = every 4 hours)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1440)
        )
        .addStringOption((option) =>
          option
            .setName("from")
            .setDescription("Start time in 24h format (e.g., 10:00)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("to")
            .setDescription("End time in 24h format (e.g., 23:00)")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all active reminders in this server")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a reminder by ID")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Reminder ID to delete")
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: errors.guildOnly(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await requireAdmin(interaction))) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      await handleAddReminder(interaction, guildId);
    } else if (subcommand === "list") {
      await handleListReminders(interaction, guildId);
    } else if (subcommand === "delete") {
      await handleDeleteReminder(interaction, guildId);
    }
  },
};

async function handleAddReminder(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const text = interaction.options.getString("text", true);
  const intervalMinutes = interaction.options.getInteger("every", true);
  const fromTimeStr = interaction.options.getString("from", true);
  const toTimeStr = interaction.options.getString("to", true);

  // Validate time formats
  const fromMinutes = parseTime(fromTimeStr);
  const toMinutes = parseTime(toTimeStr);

  if (fromMinutes === null) {
    await interaction.reply({
      content: `Invalid start time format: \`${fromTimeStr}\`. Use 24h format like \`10:00\` or \`09:30\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (toMinutes === null) {
    await interaction.reply({
      content: `Invalid end time format: \`${toTimeStr}\`. Use 24h format like \`23:00\` or \`22:30\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

  try {
    const reminder = addReminder(interaction.client, {
      guildId,
      channelId: interaction.channelId,
      creatorId: interaction.user.id,
      text,
      intervalMinutes,
      fromTime: fromTimeStr,
      toTime: toTimeStr,
    });

    const nextFire = getNextFireTime(reminder);
    const nextFireTimestamp = Math.floor(nextFire / 1000);

    await interaction.editReply({
      content: `Reminder **#${reminder.id}** created!\n` +
        `Will post every **${formatInterval(intervalMinutes)}** between **${fromTimeStr}** and **${toTimeStr}** UTC.\n` +
        `Next: <t:${nextFireTimestamp}:R> (<t:${nextFireTimestamp}:f>)`,
    });
  } catch (error) {
    console.error("[Reminder] Failed to add reminder:", error);
    await interaction.editReply({
      content: "Failed to create reminder. Please try again.",
    });
  }
}

async function handleListReminders(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const reminders = getRemindersForGuild(guildId);

  if (reminders.length === 0) {
    await interaction.reply({
      content: "No active reminders in this server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = reminders.map((r) => {
    const nextFire = getNextFireTime(r);
    const nextFireTimestamp = Math.floor(nextFire / 1000);
    const textPreview = r.text.length > 50 ? r.text.slice(0, 47) + "..." : r.text;
    return `**#${r.id}** | Every ${formatInterval(r.intervalMinutes)} | ${r.fromTime}-${r.toTime} | <#${r.channelId}>\n` +
      `\`${textPreview}\`\n` +
      `Next: <t:${nextFireTimestamp}:R>`;
  });

  await interaction.reply({
    content: `**Active Reminders:**\n\n${lines.join("\n\n")}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleDeleteReminder(
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const id = interaction.options.getInteger("id", true);

  // Check if the reminder belongs to this guild
  const reminders = getRemindersForGuild(guildId);
  const reminder = reminders.find((r) => r.id === id);

  if (!reminder) {
    await interaction.reply({
      content: `Reminder **#${id}** not found in this server.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const deleted = deleteReminder(id);

  if (deleted) {
    await interaction.reply({
      content: `Reminder **#${id}** deleted.`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.reply({
      content: `Failed to delete reminder **#${id}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

function formatInterval(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${mins}m`;
  }
  return `${minutes}m`;
}
