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
import { getGuildPushData } from "../push-requests";
import { getVillageAt } from "../map-data";
import {
  validatePushConfig,
  validateUserHasAccount,
  executePushRequestAction,
  executePushSentAction,
} from "../../actions";

// Push button IDs (defined in push-message.ts)
export { PUSH_REQUEST_BUTTON_ID, PUSH_SENT_BUTTON_ID } from "../push-message";

// Push modal IDs
export const PUSH_REQUEST_MODAL_ID = "push_request_modal";
export const PUSH_SENT_MODAL_ID = "push_sent_modal";
export const PUSH_COORDS_INPUT_ID = "push_coords_input";
export const PUSH_AMOUNT_INPUT_ID = "push_amount_input";
export const PUSH_TARGET_SELECT_ID = "push_target_select";
export const PUSH_RESOURCES_INPUT_ID = "push_resources_input";

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}

export async function handlePushRequestButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "Ši komanda veikia tik serveryje.",
      ephemeral: true,
    });
    return;
  }

  // Verify user has a linked account
  const accountResult = validateUserHasAccount(guildId, interaction.user.id);
  if (!accountResult.valid) {
    await interaction.reply({
      content: accountResult.error,
      ephemeral: true,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    await interaction.reply({
      content: "Travian serveris nesukonfigūruotas.",
      ephemeral: true,
    });
    return;
  }

  // Build modal with text inputs using LabelBuilder
  const modal = new ModalBuilder()
    .setCustomId(PUSH_REQUEST_MODAL_ID)
    .setTitle("Naujas push prašymas");

  const coordsInput = new TextInputBuilder()
    .setCustomId(PUSH_COORDS_INPUT_ID)
    .setPlaceholder("123|456")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  const coordsLabel = new LabelBuilder()
    .setLabel("Koordinatės")
    .setTextInputComponent(coordsInput);

  const amountInput = new TextInputBuilder()
    .setCustomId(PUSH_AMOUNT_INPUT_ID)
    .setPlaceholder("100000")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(15);

  const amountLabel = new LabelBuilder()
    .setLabel("Kiek resursų reikia?")
    .setTextInputComponent(amountInput);

  modal.addLabelComponents(coordsLabel, amountLabel);

  await interaction.showModal(modal);
}

export async function handlePushRequestModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Extract inputs from modal
  const coordsInput = interaction.fields.getTextInputValue(PUSH_COORDS_INPUT_ID);
  const amountInput = interaction.fields.getTextInputValue(PUSH_AMOUNT_INPUT_ID);

  // 3. Parse amount
  const resourcesNeeded = parseInt(amountInput.replace(/[,.\s]/g, ""), 10);
  if (isNaN(resourcesNeeded) || resourcesNeeded < 1) {
    await interaction.reply({
      content: "Neteisingas resursų skaičius. Įvesk teigiamą skaičių.",
      ephemeral: true,
    });
    return;
  }

  // 4. Defer reply
  await interaction.deferReply();

  // 5. Execute action
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

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply({ content: result.actionText });
}

export async function handlePushSentButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "Ši komanda veikia tik serveryje.",
      ephemeral: true,
    });
    return;
  }

  // Verify user has a linked account
  const accountResult = validateUserHasAccount(guildId, interaction.user.id);
  if (!accountResult.valid) {
    await interaction.reply({
      content: accountResult.error,
      ephemeral: true,
    });
    return;
  }

  const config = getGuildConfig(guildId);
  if (!config.serverKey) {
    await interaction.reply({
      content: "Travian serveris nesukonfigūruotas.",
      ephemeral: true,
    });
    return;
  }

  const data = getGuildPushData(guildId);
  if (data.requests.length === 0) {
    await interaction.reply({
      content: "Nėra aktyvių push užklausų.",
      ephemeral: true,
    });
    return;
  }

  // Build options from active requests
  const options: StringSelectMenuOptionBuilder[] = [];
  for (let i = 0; i < data.requests.length; i++) {
    const request = data.requests[i];
    const isFirst = i === 0 && !request.completed;
    const prefix = request.completed ? "✅ " : isFirst ? "➡️ " : "";
    const village = await getVillageAt(config.serverKey, request.x, request.y);
    const villageName = village?.villageName || "Nežinomas";
    const playerName = village?.playerName || "Nežinomas";

    // Build description: progress
    const description = `${formatNumber(request.resourcesSent)}/${formatNumber(request.resourcesNeeded)}${request.completed ? " BAIGTA" : ""}`;

    options.push(
      new StringSelectMenuOptionBuilder()
        .setDefault(i === 0)
        .setLabel(`${prefix}(${request.x}|${request.y}) ${villageName} (${playerName})`)
        .setDescription(description)
        .setValue(`${i + 1}`) // 1-based request ID
    );
  }

  // Build modal with target dropdown and resources input
  const modal = new ModalBuilder()
    .setCustomId(PUSH_SENT_MODAL_ID)
    .setTitle("Išsiunčiau resursus");

  const targetSelect = new StringSelectMenuBuilder()
    .setCustomId(PUSH_TARGET_SELECT_ID)
    .setPlaceholder("Pasirink tikslą...")
    .setRequired(true)
    .addOptions(options);

  const targetLabel = new LabelBuilder()
    .setLabel("Tikslas")
    .setStringSelectMenuComponent(targetSelect);

  const resourcesInput = new TextInputBuilder()
    .setCustomId(PUSH_RESOURCES_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("50000")
    .setRequired(true)
    .setMaxLength(15);

  const resourcesLabel = new LabelBuilder()
    .setLabel("Kiek resursų išsiunčiau?")
    .setDescription("Resursų skaičius")
    .setTextInputComponent(resourcesInput);

  modal.addLabelComponents(targetLabel, resourcesLabel);

  await interaction.showModal(modal);
}

export async function handlePushSentModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  // 1. Validate configuration
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Extract target from select menu
  const selectedValues = interaction.fields.getStringSelectValues(PUSH_TARGET_SELECT_ID);
  if (!selectedValues || selectedValues.length === 0) {
    await interaction.reply({
      content: "Klaida: nepavyko nustatyti tikslo.",
      ephemeral: true,
    });
    return;
  }

  const requestId = parseInt(selectedValues[0], 10);
  if (isNaN(requestId) || requestId < 1) {
    await interaction.reply({
      content: "Klaida: neteisingas tikslo ID.",
      ephemeral: true,
    });
    return;
  }

  // 3. Extract resources from text input
  const resourcesInput = interaction.fields.getTextInputValue(PUSH_RESOURCES_INPUT_ID);
  const resources = parseInt(resourcesInput.replace(/[,.\s]/g, ""), 10);
  if (isNaN(resources) || resources < 1) {
    await interaction.reply({
      content: "Neteisingas resursų skaičius. Įvesk teigiamą skaičių.",
      ephemeral: true,
    });
    return;
  }

  // 4. Defer reply
  await interaction.deferReply();

  // 5. Execute action
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

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  // Success: delete reply (info is in global message)
  await interaction.deleteReply();
}
