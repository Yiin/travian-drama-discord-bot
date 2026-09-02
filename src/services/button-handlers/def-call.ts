import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  GuildMember,
  MessageFlags,
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
} from "./def-call-ids";
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
    .setTitle("New defense request");

  const coordsInput = new TextInputBuilder()
    .setCustomId(DEFCALL_COORDS_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("123|456")
    .setRequired(true)
    .setMaxLength(20);
  const coordsLabel = new LabelBuilder()
    .setLabel("Coordinates")
    .setTextInputComponent(coordsInput);

  const landingInput = new TextInputBuilder()
    .setCustomId(DEFCALL_LANDING_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("12:30:45")
    .setRequired(true)
    .setMaxLength(60);
  const landingLabel = new LabelBuilder()
    .setLabel("Attack landing time")
    .setTextInputComponent(landingInput);

  const commentInput = new TextInputBuilder()
    .setCustomId(DEFCALL_COMMENT_INPUT_ID)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("WW from the north")
    .setRequired(false)
    .setMaxLength(200);
  const commentLabel = new LabelBuilder()
    .setLabel("Comment (optional)")
    .setTextInputComponent(commentInput);

  const neededInput = new TextInputBuilder()
    .setCustomId(DEFCALL_NEEDED_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("10000")
    .setRequired(false)
    .setMaxLength(10);
  const neededLabel = new LabelBuilder()
    .setLabel("Troop limit (optional)")
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

  const channelId = interaction.channelId;
  const requestData = getRequestByChannelId(guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: "This channel is not a defense request channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(DEFCALL_SENT_MODAL_ID)
    .setTitle("Sent Troops");

  const troopsInput = new TextInputBuilder()
    .setCustomId(DEFCALL_TROOPS_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("5000")
    .setRequired(true)
    .setMaxLength(10);
  const troopsLabel = new LabelBuilder()
    .setLabel("How many troops did you send?")
    .setTextInputComponent(troopsInput);

  modal.addLabelComponents(troopsLabel);
  await interaction.showModal(modal);
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
      content: "This channel is not a defense request channel.",
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

  const config = getGuildConfig(guildId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await executeDefCallSentAction(
    {
      guildId,
      config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    { requestId: requestData.requestId, troops }
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
      content: "This channel is not a defense request channel.",
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

  try {
    await interaction.editReply(confirmationEdit(result.confirmText ?? asConfirm(result.actionText)));
  } catch {
    // channel deleted before reply lands; that's fine
  }
}
