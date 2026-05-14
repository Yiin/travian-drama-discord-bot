import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  GuildMember,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { isAdmin } from "../../utils/permissions";
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
  DEFCALL_TROOPS_INPUT_ID,
} from "./def-call-ids";

export {
  DEFCALL_REQUEST_BUTTON_ID,
  DEFCALL_REQUEST_MODAL_ID,
  DEFCALL_SENT_BUTTON_ID,
  DEFCALL_SENT_MODAL_ID,
  DEFCALL_CLOSE_BUTTON_ID,
  DEFCALL_COORDS_INPUT_ID,
  DEFCALL_LANDING_INPUT_ID,
  DEFCALL_COMMENT_INPUT_ID,
  DEFCALL_TROOPS_INPUT_ID,
};

export async function handleDefCallRequestButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
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

  modal.addLabelComponents(coordsLabel, landingLabel, commentLabel);

  await interaction.showModal(modal);
}

export async function handleDefCallRequestModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  const coords = interaction.fields.getTextInputValue(DEFCALL_COORDS_INPUT_ID);
  const landing = interaction.fields.getTextInputValue(DEFCALL_LANDING_INPUT_ID);
  const comment = interaction.fields.getTextInputValue(DEFCALL_COMMENT_INPUT_ID) || undefined;

  await interaction.deferReply({ ephemeral: true });

  const result = await executeDefCallRequestAction(
    {
      guildId,
      config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    { coords, landing, comment }
  );

  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply({ content: result.actionText });
}

export async function handleDefCallSentButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const channelId = interaction.channelId;
  const requestData = getRequestByChannelId(guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: "This channel is not a defense request channel.",
      ephemeral: true,
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
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const channelId = interaction.channelId;
  if (!channelId) {
    await interaction.reply({
      content: "Failed to identify the channel.",
      ephemeral: true,
    });
    return;
  }

  const requestData = getRequestByChannelId(guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: "This channel is not a defense request channel.",
      ephemeral: true,
    });
    return;
  }

  const troopsInput = interaction.fields.getTextInputValue(DEFCALL_TROOPS_INPUT_ID);
  const troops = parseInt(troopsInput.replace(/[,.\s]/g, ""), 10);
  if (isNaN(troops) || troops < 1) {
    await interaction.reply({
      content: "Invalid troop count. Enter a positive number.",
      ephemeral: true,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  await interaction.deferReply({ ephemeral: true });

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

  await interaction.deleteReply();
}

export async function handleDefCallCloseButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const channelId = interaction.channelId;
  const requestData = getRequestByChannelId(guildId, channelId);
  if (!requestData) {
    await interaction.reply({
      content: "This channel is not a defense request channel.",
      ephemeral: true,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  await interaction.deferReply({ ephemeral: true });

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
    await interaction.editReply({ content: "Request closed, deleting channel." });
  } catch {
    // channel deleted before reply lands; that's fine
  }
}
