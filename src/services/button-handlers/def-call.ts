import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  GuildMember,
  MessageFlags,
  UserSelectMenuBuilder,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { isAdmin } from "../../utils/permissions";
import { parseTroopCount } from "../../utils/parse-number";
import { getRequestByChannelId } from "../def-calls";
import { executeDefCallRequestAction } from "../../actions/def-call-request.action";
import { executeDefCallSentAction } from "../../actions/def-call-sent.action";
import { executeDefCallCloseAction } from "../../actions/def-call-close.action";
import {
  DEFCALL_REQUEST_BUTTON_ID,
  DEFCALL_REQUEST_MODAL_ID,
  DEFCALL_SENT_BUTTON_ID,
  DEFCALL_SENT_MODAL_ID,
  DEFCALL_CLOSE_BUTTON_ID,
  DEFCALL_COORDS_INPUT_ID,
  DEFCALL_LANDING_INPUT_ID,
  DEFCALL_COMMENT_INPUT_ID,
  DEFCALL_NEEDED_INPUT_ID,
  DEFCALL_TROOPS_INPUT_ID,
  DEFCALL_SENT_FOR_BUTTON_ID,
  DEFCALL_SENT_FOR_SELECT_ID,
} from "./def-call-ids";
import { formatTroops } from "../../utils/format";
import { errors } from "../../actions/messages";
import { confirmationEdit, asConfirm, channelUrl } from "../../actions/messages";

export {
  DEFCALL_REQUEST_BUTTON_ID,
  DEFCALL_REQUEST_MODAL_ID,
  DEFCALL_SENT_BUTTON_ID,
  DEFCALL_SENT_MODAL_ID,
  DEFCALL_CLOSE_BUTTON_ID,
  DEFCALL_COORDS_INPUT_ID,
  DEFCALL_LANDING_INPUT_ID,
  DEFCALL_COMMENT_INPUT_ID,
  DEFCALL_NEEDED_INPUT_ID,
  DEFCALL_TROOPS_INPUT_ID,
  DEFCALL_SENT_FOR_BUTTON_ID,
  DEFCALL_SENT_FOR_SELECT_ID,
};

export async function handleDefCallRequestButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: errors.guildOnly(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(DEFCALL_REQUEST_MODAL_ID)
    .setTitle("Request defense");

  const coordsInput = new TextInputBuilder()
    .setCustomId(DEFCALL_COORDS_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("123|456")
    .setRequired(true)
    .setMaxLength(20);
  const coordsLabel = new LabelBuilder()
    .setLabel("Coordinates")
    .setDescription("Village under attack, for example 123|456 or -45|89")
    .setTextInputComponent(coordsInput);

  const landingInput = new TextInputBuilder()
    .setCustomId(DEFCALL_LANDING_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("12:30:45")
    .setRequired(true)
    .setMaxLength(60);
  const landingLabel = new LabelBuilder()
    .setLabel("Landing time")
    .setDescription("Server time, for example 12:30 or 12:30:45, or paste the Travian text")
    .setTextInputComponent(landingInput);

  const commentInput = new TextInputBuilder()
    .setCustomId(DEFCALL_COMMENT_INPUT_ID)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("WW from the north")
    .setRequired(false)
    .setMaxLength(200);
  const commentLabel = new LabelBuilder()
    .setLabel("Note (optional)")
    .setDescription("What is coming, for example: WW from the north, 3 waves")
    .setTextInputComponent(commentInput);

  const neededInput = new TextInputBuilder()
    .setCustomId(DEFCALL_NEEDED_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("10000")
    .setRequired(false)
    .setMaxLength(10);
  const neededLabel = new LabelBuilder()
    .setLabel("Troop limit (optional)")
    .setDescription("The card turns green once this many troops are reported, for example 10000")
    .setTextInputComponent(neededInput);

  modal.addLabelComponents(coordsLabel, landingLabel, commentLabel, neededLabel);

  await interaction.showModal(modal);
}

export async function handleDefCallRequestModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: errors.guildOnly(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  const coords = interaction.fields.getTextInputValue(DEFCALL_COORDS_INPUT_ID);
  const landing = interaction.fields.getTextInputValue(DEFCALL_LANDING_INPUT_ID);
  const comment = interaction.fields.getTextInputValue(DEFCALL_COMMENT_INPUT_ID) || undefined;
  const neededRaw = interaction.fields.getTextInputValue(DEFCALL_NEEDED_INPUT_ID);
  const troopsNeeded = parseTroopCount(neededRaw) ?? undefined;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (neededRaw.trim() && troopsNeeded === undefined) {
    await interaction.editReply({
      content: errors.invalidCount("troops for the limit"),
    });
    return;
  }

  const result = await executeDefCallRequestAction(
    {
      guildId,
      config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    { coords, landing, comment, troopsNeeded }
  );

  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
      actionId: result.actionId,
      panelUrl: channelUrl(guildId, result.channelId),
      panelLabel: "Open thread",
    })
  );
}

function buildSentModal(request: { troopsSent: number; troopsNeeded?: number }): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(DEFCALL_SENT_MODAL_ID)
    .setTitle("Report sent troops");

  const current = request.troopsNeeded
    ? `Current: ${formatTroops(request.troopsSent)} / ${formatTroops(request.troopsNeeded)}`
    : `Current: ${formatTroops(request.troopsSent)} sent`;

  const troopsInput = new TextInputBuilder()
    .setCustomId(DEFCALL_TROOPS_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("5000")
    .setRequired(true)
    .setMaxLength(10);
  const troopsLabel = new LabelBuilder()
    .setLabel("Troops sent")
    .setDescription(`Whole number. ${current}`)
    .setTextInputComponent(troopsInput);

  const forSelect = new UserSelectMenuBuilder()
    .setCustomId(DEFCALL_SENT_FOR_SELECT_ID)
    .setPlaceholder("Pick a member…")
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false);
  const forLabel = new LabelBuilder()
    .setLabel("Sent by")
    .setDescription("Leave empty if you sent them yourself")
    .setUserSelectMenuComponent(forSelect);

  modal.addLabelComponents(troopsLabel, forLabel);
  return modal;
}

/** Both "I sent troops" and "Sent for someone" open the same modal. */
export async function handleDefCallSentButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: errors.guildOnly(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const requestData = getRequestByChannelId(guildId, interaction.channelId);
  if (!requestData) {
    await interaction.reply({
      content: errors.notInThread("defense"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (requestData.request.closed) {
    await interaction.reply({
      content: "⚠️ **This defense call is closed.** Undo the close first if it was a mistake.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.showModal(buildSentModal(requestData.request));
}

export async function handleDefCallSentModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: errors.guildOnly(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channelId = interaction.channelId;
  if (!channelId) {
    await interaction.reply({
      content: "Failed to identify the channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const requestData = getRequestByChannelId(guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: errors.notInThread("defense"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const troopsInput = interaction.fields.getTextInputValue(DEFCALL_TROOPS_INPUT_ID);
  const troops = parseTroopCount(troopsInput);
  if (troops === null) {
    await interaction.reply({
      content: errors.invalidCount("troops"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const sentBy = interaction.fields.getSelectedUsers(DEFCALL_SENT_FOR_SELECT_ID, false)?.first();

  const config = getGuildConfig(guildId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await executeDefCallSentAction(
    {
      guildId,
      config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    { requestId: requestData.requestId, troops, creditUserId: sentBy?.id }
  );

  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}

export async function handleDefCallCloseButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: errors.guildOnly(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channelId = interaction.channelId;
  const requestData = getRequestByChannelId(guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: errors.notInThread("defense"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userIsAdmin = isAdmin(interaction.member as GuildMember | null);

  const result = await executeDefCallCloseAction(
    {
      guildId,
      config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    { requestId: requestData.requestId },
    { isAdmin: userIsAdmin }
  );

  if (!result.success) {
    try {
      await interaction.editReply({ content: result.error });
    } catch {
      // ignore
    }
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}
