import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  LabelBuilder,
  MessageFlags,
  UserSelectMenuBuilder,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { getGuildDefenseData } from "../defense-requests";
import { getVillageAt } from "../map-data";
import {
  validateDefenseConfig,
  executeSentAction,
  executeStackAction,
} from "../../actions";
import { errors, failReply, failEdit } from "../../actions/messages";
import { getStackPanelUrl } from "../defense-message";
import { stackChoiceLabel } from "../../utils/choices";
import { formatTroops } from "../../utils/format";
import { confirmationEdit, asConfirm, channelUrl } from "../../actions/messages";

// Defense button/modal IDs
export const SENT_BUTTON_ID = "sent_troops_button";
export const SENT_MODAL_ID = "sent_troops_modal";
export const TARGET_SELECT_ID = "target_select";
export const TROOPS_INPUT_ID = "troops_input";
export const SENT_FOR_SELECT_ID = "sent_for_select";

export const REQUEST_DEF_BUTTON_ID = "request_def_button";
export const REQUEST_DEF_MODAL_ID = "request_def_modal";
export const COORDS_INPUT_ID = "coords_input";
export const TROOPS_NEEDED_INPUT_ID = "troops_needed_input";
export const MESSAGE_INPUT_ID = "message_input";

export async function handleSentButton(
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

  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    await interaction.reply({
      ...failReply(errors.notSetUp(), interaction),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const data = getGuildDefenseData(guildId);
  if (data.requests.length === 0) {
    await interaction.reply({
      content: "⚠️ **There are no open stack requests.** Press **Request stack** to add one.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Build options from active requests
  const options: StringSelectMenuOptionBuilder[] = [];
  for (let i = 0; i < data.requests.length; i++) {
    const request = data.requests[i];
    const village = await getVillageAt(config.serverKey, request.x, request.y);

    const playerPart = village ? `${village.playerName}` : "unknown village";
    let description = playerPart;
    if (request.message) {
      const maxMsgLen = 100 - description.length - 3; // Discord limit is 100 chars
      const truncatedMsg = request.message.length > maxMsgLen
        ? request.message.substring(0, maxMsgLen - 3) + "..."
        : request.message;
      description += ` · ${truncatedMsg}`;
    }

    options.push(
      new StringSelectMenuOptionBuilder()
        .setDefault(i === 0)
        .setLabel(stackChoiceLabel(request, village?.villageName, i === 0))
        .setDescription(description)
        .setValue(`${request.id}`)
    );
  }

  // Build modal with target dropdown and troop input
  const modal = new ModalBuilder()
    .setCustomId(SENT_MODAL_ID)
    .setTitle("Report sent troops");

  const targetSelect = new StringSelectMenuBuilder()
    .setCustomId(TARGET_SELECT_ID)
    .setPlaceholder("Select a target...")
    .setRequired(true)
    .addOptions(options);

  const targetLabel = new LabelBuilder()
    .setLabel("Target")
    .setDescription("Requests in priority order")
    .setStringSelectMenuComponent(targetSelect);

  const first = data.requests[0];
  const troopsInput = new TextInputBuilder()
    .setCustomId(TROOPS_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("500")
    .setRequired(true)
    .setMaxLength(10);

  const troopsLabel = new LabelBuilder()
    .setLabel("Troops sent")
    .setDescription(`Whole number. Current: ${formatTroops(first.troopsSent)} / ${formatTroops(first.troopsNeeded)} on the first request`)
    .setTextInputComponent(troopsInput);

  const forSelect = new UserSelectMenuBuilder()
    .setCustomId(SENT_FOR_SELECT_ID)
    .setPlaceholder("Pick a member…")
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false);

  const forLabel = new LabelBuilder()
    .setLabel("Sent by")
    .setDescription("Leave empty if you sent them yourself")
    .setUserSelectMenuComponent(forSelect);

  modal.addLabelComponents(targetLabel, troopsLabel, forLabel);

  await interaction.showModal(modal);
}

export async function handleSentModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply(failReply(validation.error, interaction));
    return;
  }

  // 2. Extract target from select menu
  const selectedValues = interaction.fields.getStringSelectValues(TARGET_SELECT_ID);
  if (!selectedValues || selectedValues.length === 0) {
    await interaction.reply({
      content: errors.notFound("target"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const requestId = parseInt(selectedValues[0], 10);
  if (isNaN(requestId) || requestId < 1) {
    await interaction.reply({
      content: errors.notFound("target"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 3. Extract troops from text input
  const troopsInput = interaction.fields.getTextInputValue(TROOPS_INPUT_ID);
  const troops = parseInt(troopsInput.replace(/[,.\s]/g, ""), 10);
  if (isNaN(troops) || troops < 1) {
    await interaction.reply({
      content: errors.invalidCount("troops"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sentBy = interaction.fields.getSelectedUsers(SENT_FOR_SELECT_ID, false)?.first();
  const creditUserId = sentBy?.id ?? interaction.user.id;

  // 4. Defer reply
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 5. Execute action
  const result = await executeSentAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      target: requestId.toString(),
      troops,
      creditUserId,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply(failEdit(result.error, interaction));
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
      actionId: result.actionId,
      panelUrl: getStackPanelUrl(validation.guildId),
    })
  );
}

export async function handleRequestDefButton(
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

  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    await interaction.reply({
      ...failReply(errors.notSetUp(), interaction),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Build modal with text inputs using LabelBuilder
  const modal = new ModalBuilder()
    .setCustomId(REQUEST_DEF_MODAL_ID)
    .setTitle("Request stack");

  const coordsInput = new TextInputBuilder()
    .setCustomId(COORDS_INPUT_ID)
    .setPlaceholder("123|456")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  const coordsLabel = new LabelBuilder()
    .setLabel("Coordinates")
    .setDescription("Village to stack, for example 123|456 or -45|89")
    .setTextInputComponent(coordsInput);

  const troopsInput = new TextInputBuilder()
    .setCustomId(TROOPS_NEEDED_INPUT_ID)
    .setPlaceholder("1000")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const troopsLabel = new LabelBuilder()
    .setLabel("Troops needed")
    .setDescription("Total defense to collect, for example 5000")
    .setTextInputComponent(troopsInput);

  const messageInput = new TextInputBuilder()
    .setCustomId(MESSAGE_INPUT_ID)
    .setPlaceholder("e.g. anti cav")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const messageLabel = new LabelBuilder()
    .setLabel("Note (optional)")
    .setDescription("Shown on the panel, for example: anti cav, or the attack time")
    .setTextInputComponent(messageInput);

  modal.addLabelComponents(coordsLabel, troopsLabel, messageLabel);

  await interaction.showModal(modal);
}

export async function handleRequestDefModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply(failReply(validation.error, interaction));
    return;
  }

  // 2. Extract inputs from modal
  const coordsInput = interaction.fields.getTextInputValue(COORDS_INPUT_ID);
  const troopsInput = interaction.fields.getTextInputValue(TROOPS_NEEDED_INPUT_ID);
  const message = interaction.fields.getTextInputValue(MESSAGE_INPUT_ID) || "";

  // 3. Parse troops (coords validation is done in action)
  const troopsNeeded = parseInt(troopsInput.replace(/[,.\s]/g, ""), 10);
  if (isNaN(troopsNeeded) || troopsNeeded < 1) {
    await interaction.reply({
      content: errors.invalidCount("troops"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 4. Defer reply
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 5. Execute action
  const result = await executeStackAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      coords: coordsInput,
      troopsNeeded,
      message,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply(failEdit(result.error, interaction));
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
      actionId: result.actionId,
      panelUrl: getStackPanelUrl(validation.guildId),
    })
  );
}
