import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  LabelBuilder,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { getGuildDefenseData } from "../defense-requests";
import { getVillageAt } from "../map-data";
import {
  validateDefenseConfig,
  executeSentAction,
  executeStackAction,
} from "../../actions";

// Defense button/modal IDs
export const SENT_BUTTON_ID = "sent_troops_button";
export const SENT_MODAL_ID = "sent_troops_modal";
export const TARGET_SELECT_ID = "target_select";
export const TROOPS_INPUT_ID = "troops_input";

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
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    await interaction.reply({
      content: "Travian server is not configured.",
      ephemeral: true,
    });
    return;
  }

  const data = getGuildDefenseData(guildId);
  if (data.requests.length === 0) {
    await interaction.reply({
      content: "There are no active defense requests.",
      ephemeral: true,
    });
    return;
  }

  // Build options from active requests
  const options: StringSelectMenuOptionBuilder[] = [];
  for (let i = 0; i < data.requests.length; i++) {
    const prefix = i === 0 ? "➡️ " : "";
    const request = data.requests[i];
    const village = await getVillageAt(config.serverKey, request.x, request.y);
    const villageName = village?.villageName || "Unknown";
    const playerName = village?.playerName || "Unknown";

    // Build description: progress + message (truncated if needed)
    let description = `${request.troopsSent}/${request.troopsNeeded}`;
    if (request.message) {
      const maxMsgLen = 100 - description.length - 3; // Discord limit is 100 chars
      const truncatedMsg = request.message.length > maxMsgLen
        ? request.message.substring(0, maxMsgLen - 3) + "..."
        : request.message;
      description += ` - ${truncatedMsg}`;
    }

    options.push(
      new StringSelectMenuOptionBuilder()
        .setDefault(i === 0)
        .setLabel(`${prefix}(${request.x}|${request.y}) ${villageName} (${playerName})`)
        .setDescription(description)
        .setValue(`${i + 1}`) // 1-based request ID
    );
  }

  // Build modal with target dropdown and troop input
  const modal = new ModalBuilder()
    .setCustomId(SENT_MODAL_ID)
    .setTitle("Sent karius");

  const targetSelect = new StringSelectMenuBuilder()
    .setCustomId(TARGET_SELECT_ID)
    .setPlaceholder("Select a target...")
    .setRequired(true)
    .addOptions(options);

  const targetLabel = new LabelBuilder()
    .setLabel("Tikslas")
    .setStringSelectMenuComponent(targetSelect);

  const troopsInput = new TextInputBuilder()
    .setCustomId(TROOPS_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("500")
    .setRequired(true)
    .setMaxLength(10);

  const troopsLabel = new LabelBuilder()
    .setLabel("How many troops did you send?")
    .setDescription("Troop count")
    .setTextInputComponent(troopsInput);

  modal.addLabelComponents(targetLabel, troopsLabel);

  await interaction.showModal(modal);
}

export async function handleSentModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Extract target from select menu
  const selectedValues = interaction.fields.getStringSelectValues(TARGET_SELECT_ID);
  if (!selectedValues || selectedValues.length === 0) {
    await interaction.reply({
      content: "Error: failed to identify the target.",
      ephemeral: true,
    });
    return;
  }

  const requestId = parseInt(selectedValues[0], 10);
  if (isNaN(requestId) || requestId < 1) {
    await interaction.reply({
      content: "Error: invalid target ID.",
      ephemeral: true,
    });
    return;
  }

  // 3. Extract troops from text input
  const troopsInput = interaction.fields.getTextInputValue(TROOPS_INPUT_ID);
  const troops = parseInt(troopsInput, 10);
  if (isNaN(troops) || troops < 1) {
    await interaction.reply({
      content: "Invalid troop count. Enter a positive number.",
      ephemeral: true,
    });
    return;
  }

  // 4. Defer reply
  await interaction.deferReply();

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
      creditUserId: interaction.user.id,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  // Success: delete reply (info is in global message)
  await interaction.deleteReply();
}

export async function handleRequestDefButton(
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

  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    await interaction.reply({
      content: "Travian server is not configured.",
      ephemeral: true,
    });
    return;
  }

  // Build modal with text inputs using LabelBuilder
  const modal = new ModalBuilder()
    .setCustomId(REQUEST_DEF_MODAL_ID)
    .setTitle("New defense request");

  const coordsInput = new TextInputBuilder()
    .setCustomId(COORDS_INPUT_ID)
    .setPlaceholder("123|456")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  const coordsLabel = new LabelBuilder()
    .setLabel("Coordinates")
    .setTextInputComponent(coordsInput);

  const troopsInput = new TextInputBuilder()
    .setCustomId(TROOPS_NEEDED_INPUT_ID)
    .setPlaceholder("1000")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const troopsLabel = new LabelBuilder()
    .setLabel("How many troops are needed?")
    .setTextInputComponent(troopsInput);

  const messageInput = new TextInputBuilder()
    .setCustomId(MESSAGE_INPUT_ID)
    .setPlaceholder("Pvz.: anti cav")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const messageLabel = new LabelBuilder()
    .setLabel("Additional information (optional)")
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
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Extract inputs from modal
  const coordsInput = interaction.fields.getTextInputValue(COORDS_INPUT_ID);
  const troopsInput = interaction.fields.getTextInputValue(TROOPS_NEEDED_INPUT_ID);
  const message = interaction.fields.getTextInputValue(MESSAGE_INPUT_ID) || "";

  // 3. Parse troops (coords validation is done in action)
  const troopsNeeded = parseInt(troopsInput, 10);
  if (isNaN(troopsNeeded) || troopsNeeded < 1) {
    await interaction.reply({
      content: "Invalid troop count. Enter a positive number.",
      ephemeral: true,
    });
    return;
  }

  // 4. Defer reply
  await interaction.deferReply();

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
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply({ content: result.actionText });
}
