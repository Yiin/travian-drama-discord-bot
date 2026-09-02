import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  LabelBuilder,
  Client,
  time,
  TimestampStyles,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { scheduleScoutNotification, cancelScoutNotifications } from "../scout-scheduler";
import { parseTimeToTimestamp } from "../../utils/time";
import {
  getScoutRequestByMessageId,
  findScoutByMessageId,
  setScoutGoing,
  markScoutDone,
  ScoutRequest,
} from "../scout-requests";
import { updateScoutCard } from "../scout-message";
import { isValidReportLink, normalizeReportLink } from "../../utils/report-link";
import { errors } from "../../actions/messages";
import {
  SCOUT_GOING_BUTTON_ID,
  SCOUT_GOING_MODAL_ID,
  SCOUT_TIME_INPUT_ID,
  SCOUT_RESULT_BUTTON_ID,
  SCOUT_RESULT_MODAL_ID,
  SCOUT_REPORT_INPUT_ID,
} from "./scout-ids";

export {
  SCOUT_GOING_BUTTON_ID,
  SCOUT_GOING_MODAL_ID,
  SCOUT_TIME_INPUT_ID,
  SCOUT_RESULT_BUTTON_ID,
  SCOUT_RESULT_MODAL_ID,
  SCOUT_REPORT_INPUT_ID,
};

/** Card buttons carry no suffix; retry buttons on ephemeral replies carry `:<messageId>`. */
function targetMessageId(interaction: ButtonInteraction): string {
  const [, suffix] = interaction.customId.split(":");
  return suffix || interaction.message.id;
}

async function openScoutOrReply(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  messageId: string
): Promise<{ guildId: string; request: ScoutRequest } | null> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
    return null;
  }
  const request = getScoutRequestByMessageId(guildId, messageId);
  if (!request) {
    await interaction.reply({ content: errors.notFound("scout request"), flags: MessageFlags.Ephemeral });
    return null;
  }
  if (request.status === "done") {
    await interaction.reply({ content: "⚠️ **This scout request is already done.**", flags: MessageFlags.Ephemeral });
    return null;
  }
  return { guildId, request };
}

// --- I'm going ---

export async function handleScoutGoingButton(interaction: ButtonInteraction): Promise<void> {
  const messageId = targetMessageId(interaction);
  const ctx = await openScoutOrReply(interaction, messageId);
  if (!ctx) return;

  const modal = new ModalBuilder()
    .setCustomId(`${SCOUT_GOING_MODAL_ID}:${messageId}`)
    .setTitle("I'm going to scout");

  const timeInput = new TextInputBuilder()
    .setCustomId(SCOUT_TIME_INPUT_ID)
    .setPlaceholder("12:30")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const timeLabel = new LabelBuilder()
    .setLabel("Landing time")
    .setDescription("Server time when your scouts arrive, for example 12:30 or 12:30:45")
    .setTextInputComponent(timeInput);

  modal.addLabelComponents(timeLabel);
  await interaction.showModal(modal);
}

export async function handleScoutGoingModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, messageId] = interaction.customId.split(":");
  if (!messageId) {
    await interaction.reply({ content: errors.notFound("scout request"), flags: MessageFlags.Ephemeral });
    return;
  }
  const ctx = await openScoutOrReply(interaction, messageId);
  if (!ctx) return;

  const rawTime = interaction.fields.getTextInputValue(SCOUT_TIME_INPUT_ID).trim();
  const config = getGuildConfig(ctx.guildId);
  const arrivalAt = parseTimeToTimestamp(rawTime, config.serverTimezone) ?? undefined;

  const updated = setScoutGoing(ctx.guildId, ctx.request.id, {
    userId: interaction.user.id,
    displayName: interaction.user.displayName,
    arrivalAt,
    rawTime,
  });
  if (!updated) {
    await interaction.reply({ content: errors.notFound("scout request"), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await updateScoutCard(interaction.client, ctx.guildId, updated);

  if (arrivalAt !== undefined) {
    scheduleScoutNotification(
      interaction.client,
      {
        messageId,
        channelId: updated.channelId,
        guildId: ctx.guildId,
        requesterId: updated.requesterId,
        goingUserId: interaction.user.id,
        goingUserName: interaction.user.displayName,
        coords: { x: updated.x, y: updated.y },
        arrivalTimestamp: arrivalAt,
      },
      markScoutMessageAsDoneById
    );
  }

  const when = arrivalAt !== undefined
    ? `lands ${time(arrivalAt, TimestampStyles.RelativeTime)}`
    : `at "${rawTime}" (could not read that as a time, so no reminder)`;
  await interaction.editReply({ content: `✅ Marked you as going, ${when}.` });
}

// --- Report result ---

function buildResultModal(messageId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${SCOUT_RESULT_MODAL_ID}:${messageId}`)
    .setTitle("Scout result");

  const linkInput = new TextInputBuilder()
    .setCustomId(SCOUT_REPORT_INPUT_ID)
    .setPlaceholder("https://ts31.x3.europe.travian.com/report?id=…")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500);

  const linkLabel = new LabelBuilder()
    .setLabel("Report link")
    .setDescription("Paste the in-game report URL")
    .setTextInputComponent(linkInput);

  modal.addLabelComponents(linkLabel);
  return modal;
}

export async function handleScoutResultButton(interaction: ButtonInteraction): Promise<void> {
  const messageId = targetMessageId(interaction);
  const ctx = await openScoutOrReply(interaction, messageId);
  if (!ctx) return;
  await interaction.showModal(buildResultModal(messageId));
}

export async function handleScoutResultModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, messageId] = interaction.customId.split(":");
  if (!messageId) {
    await interaction.reply({ content: errors.notFound("scout request"), flags: MessageFlags.Ephemeral });
    return;
  }
  const ctx = await openScoutOrReply(interaction, messageId);
  if (!ctx) return;

  const link = interaction.fields.getTextInputValue(SCOUT_REPORT_INPUT_ID);
  const config = getGuildConfig(ctx.guildId);
  if (!isValidReportLink(link, config.serverKey)) {
    const retry = new ButtonBuilder()
      .setCustomId(`${SCOUT_RESULT_BUTTON_ID}:${messageId}`)
      .setLabel("Try again")
      .setStyle(ButtonStyle.Primary);
    await interaction.reply({
      content: "⚠️ **That is not a Travian report link.** Open the report in game, copy the address bar, and paste it.",
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(retry)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const done = await completeScout(interaction.client, ctx.guildId, ctx.request, normalizeReportLink(link));
  await interaction.editReply({
    content: done ? "✅ Result saved. The card now links to the report." : errors.generic(),
  });
}

/** Mark a scout done (optionally with the report link), re-render, cancel reminders. */
export async function completeScout(
  client: Client,
  guildId: string,
  request: ScoutRequest,
  reportUrl?: string
): Promise<boolean> {
  const done = markScoutDone(guildId, request.id, reportUrl);
  if (!done) return false;
  if (done.messageId) cancelScoutNotifications(done.messageId);
  await updateScoutCard(client, guildId, done);
  return true;
}

/**
 * Scheduler callback: the scouts landed, mark the request done.
 * Looks the request up in the store by message id.
 */
export async function markScoutMessageAsDoneById(
  messageId: string,
  _channelId: string,
  client?: Client
): Promise<void> {
  if (!client) return;
  const found = findScoutByMessageId(messageId);
  if (!found || found.request.status === "done") return;
  await completeScout(client, found.guildId, found.request);
}
