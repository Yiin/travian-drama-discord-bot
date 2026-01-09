import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import {
  getRequestById,
  getAllRequests,
  moveRequest,
  removeRequest,
  updateRequest,
} from "../defense-requests";
import { getVillageAt, formatVillageDisplay, getMapLink } from "../map-data";
import { updateGlobalMessage } from "../defense-message";
import { recordAction } from "../action-history";

// Button IDs (prefixes - actual IDs will be like "stack_up:3")
export const STACK_UP_PREFIX = "stack_up";
export const STACK_DOWN_PREFIX = "stack_down";
export const STACK_EDIT_PREFIX = "stack_edit";
export const STACK_DELETE_PREFIX = "stack_delete";
export const STACK_CONFIRM_DELETE_PREFIX = "stack_confirm_delete";
export const STACK_CANCEL_DELETE_PREFIX = "stack_cancel_delete";

// Modal IDs
export const STACK_EDIT_MODAL_PREFIX = "stack_edit_modal";
export const STACK_TROOPS_NEEDED_INPUT_ID = "stack_troops_needed";
export const STACK_MESSAGE_INPUT_ID = "stack_message";

function parseRequestId(customId: string): number | null {
  const parts = customId.split(":");
  if (parts.length !== 2) return null;
  const id = parseInt(parts[1], 10);
  return isNaN(id) ? null : id;
}

export function buildStackEditButtons(
  requestId: number,
  totalRequests: number
): ActionRowBuilder<ButtonBuilder> {
  const upButton = new ButtonBuilder()
    .setCustomId(`${STACK_UP_PREFIX}:${requestId}`)
    .setLabel("Up")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(requestId === 1);

  const downButton = new ButtonBuilder()
    .setCustomId(`${STACK_DOWN_PREFIX}:${requestId}`)
    .setLabel("Down")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(requestId === totalRequests);

  const editButton = new ButtonBuilder()
    .setCustomId(`${STACK_EDIT_PREFIX}:${requestId}`)
    .setLabel("Edit")
    .setStyle(ButtonStyle.Primary);

  const deleteButton = new ButtonBuilder()
    .setCustomId(`${STACK_DELETE_PREFIX}:${requestId}`)
    .setLabel("Delete")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    upButton,
    downButton,
    editButton,
    deleteButton
  );
}

function buildConfirmDeleteButtons(
  requestId: number
): ActionRowBuilder<ButtonBuilder> {
  const confirmButton = new ButtonBuilder()
    .setCustomId(`${STACK_CONFIRM_DELETE_PREFIX}:${requestId}`)
    .setLabel("Patvirtinti")
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`${STACK_CANCEL_DELETE_PREFIX}:${requestId}`)
    .setLabel("Atšaukti")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
    cancelButton
  );
}

async function buildStackInfoContent(
  guildId: string,
  requestId: number
): Promise<string | null> {
  const config = getGuildConfig(guildId);
  const request = getRequestById(guildId, requestId);
  const totalRequests = getAllRequests(guildId).length;

  if (!request) {
    return null;
  }

  const village = config.serverKey
    ? await getVillageAt(config.serverKey, request.x, request.y)
    : null;

  const villageName = village?.villageName || "Nežinomas";
  const playerName = village?.playerName || "Nežinomas";
  const villageDisplay = village && config.serverKey
    ? formatVillageDisplay(config.serverKey, village)
    : `(${request.x}|${request.y})`;

  const progress = request.troopsNeeded > 0
    ? Math.round((request.troopsSent / request.troopsNeeded) * 100)
    : 0;

  const lines = [
    `**#${requestId}/${totalRequests}** ${villageDisplay}`,
    `**Kaimas:** ${villageName}`,
    `**Žaidėjas:** ${playerName}`,
    `**Kariai:** ${request.troopsSent}/${request.troopsNeeded} (${progress}%)`,
  ];

  if (request.message) {
    lines.push(`**Žinutė:** ${request.message}`);
  }

  return lines.join("\n");
}

export async function handleStackUpButton(
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

  const requestId = parseRequestId(interaction.customId);
  if (!requestId) {
    await interaction.reply({
      content: "Klaida: neteisingas užklausos ID.",
      ephemeral: true,
    });
    return;
  }

  if (requestId === 1) {
    await interaction.reply({
      content: "Užklausa jau yra viršuje.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  // Move up means swap with position above (requestId - 1)
  const result = moveRequest(guildId, requestId, requestId - 1);
  if (!result.success) {
    await interaction.followUp({
      content: result.error || "Nepavyko perkelti užklausos.",
      ephemeral: true,
    });
    return;
  }

  // Update global defense message
  await updateGlobalMessage(interaction.client, guildId);

  // Update the ephemeral message with new position info
  const newRequestId = requestId - 1;
  const totalRequests = getAllRequests(guildId).length;
  const content = await buildStackInfoContent(guildId, newRequestId);

  if (!content) {
    await interaction.editReply({
      content: "Užklausa nerasta.",
      components: [],
    });
    return;
  }

  await interaction.editReply({
    content,
    components: [buildStackEditButtons(newRequestId, totalRequests)],
  });
}

export async function handleStackDownButton(
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

  const requestId = parseRequestId(interaction.customId);
  if (!requestId) {
    await interaction.reply({
      content: "Klaida: neteisingas užklausos ID.",
      ephemeral: true,
    });
    return;
  }

  const totalRequests = getAllRequests(guildId).length;

  if (requestId === totalRequests) {
    await interaction.reply({
      content: "Užklausa jau yra apačioje.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  // Move down means swap with position below (requestId + 1)
  const result = moveRequest(guildId, requestId, requestId + 1);
  if (!result.success) {
    await interaction.followUp({
      content: result.error || "Nepavyko perkelti užklausos.",
      ephemeral: true,
    });
    return;
  }

  // Update global defense message
  await updateGlobalMessage(interaction.client, guildId);

  // Update the ephemeral message with new position info
  const newRequestId = requestId + 1;
  const newTotalRequests = getAllRequests(guildId).length;
  const content = await buildStackInfoContent(guildId, newRequestId);

  if (!content) {
    await interaction.editReply({
      content: "Užklausa nerasta.",
      components: [],
    });
    return;
  }

  await interaction.editReply({
    content,
    components: [buildStackEditButtons(newRequestId, newTotalRequests)],
  });
}

export async function handleStackEditButton(
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

  const requestId = parseRequestId(interaction.customId);
  if (!requestId) {
    await interaction.reply({
      content: "Klaida: neteisingas užklausos ID.",
      ephemeral: true,
    });
    return;
  }

  const request = getRequestById(guildId, requestId);
  if (!request) {
    await interaction.reply({
      content: `Užklausa #${requestId} nerasta.`,
      ephemeral: true,
    });
    return;
  }

  // Build modal with pre-filled values
  const modal = new ModalBuilder()
    .setCustomId(`${STACK_EDIT_MODAL_PREFIX}:${requestId}`)
    .setTitle(`Redaguoti #${requestId}`);

  const troopsInput = new TextInputBuilder()
    .setCustomId(STACK_TROOPS_NEEDED_INPUT_ID)
    .setPlaceholder("1000")
    .setValue(request.troopsNeeded.toString())
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const troopsLabel = new LabelBuilder()
    .setLabel("Kiek karių reikia?")
    .setTextInputComponent(troopsInput);

  const messageInput = new TextInputBuilder()
    .setCustomId(STACK_MESSAGE_INPUT_ID)
    .setPlaceholder("Pvz.: anti cav")
    .setValue(request.message || "")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const messageLabel = new LabelBuilder()
    .setLabel("Žinutė (nebūtina)")
    .setTextInputComponent(messageInput);

  modal.addLabelComponents(troopsLabel, messageLabel);

  await interaction.showModal(modal);
}

export async function handleStackEditModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "Ši komanda veikia tik serveryje.",
      ephemeral: true,
    });
    return;
  }

  const requestId = parseRequestId(interaction.customId);
  if (!requestId) {
    await interaction.reply({
      content: "Klaida: neteisingas užklausos ID.",
      ephemeral: true,
    });
    return;
  }

  const request = getRequestById(guildId, requestId);
  if (!request) {
    await interaction.reply({
      content: `Užklausa #${requestId} nerasta.`,
      ephemeral: true,
    });
    return;
  }

  // Extract values from modal
  const troopsInput = interaction.fields.getTextInputValue(STACK_TROOPS_NEEDED_INPUT_ID);
  const message = interaction.fields.getTextInputValue(STACK_MESSAGE_INPUT_ID) || "";

  const troopsNeeded = parseInt(troopsInput, 10);
  if (isNaN(troopsNeeded) || troopsNeeded < 1) {
    await interaction.reply({
      content: "Neteisingas karių skaičius. Įvesk teigiamą skaičių.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  // Snapshot for undo
  const previousState = {
    troopsSent: request.troopsSent,
    troopsNeeded: request.troopsNeeded,
    message: request.message,
  };

  // Update the request
  const result = updateRequest(guildId, requestId, {
    troopsNeeded,
    message,
  });

  if ("error" in result) {
    await interaction.followUp({
      content: result.error,
      ephemeral: true,
    });
    return;
  }

  // Record action for undo
  const config = getGuildConfig(guildId);
  recordAction(guildId, {
    type: "ADMIN_UPDATE",
    userId: interaction.user.id,
    coords: { x: request.x, y: request.y },
    requestId,
    previousState: { ...request, contributors: [...request.contributors] },
    data: {
      previousTroopsSent: previousState.troopsSent,
      previousTroopsNeeded: previousState.troopsNeeded,
      previousMessage: previousState.message,
      didComplete: result.troopsSent >= result.troopsNeeded,
    },
  });

  // Update global defense message
  await updateGlobalMessage(interaction.client, guildId);

  // Check if request was completed (auto-removed)
  const updatedRequest = getRequestById(guildId, requestId);
  if (!updatedRequest) {
    await interaction.editReply({
      content: `Užklausa #${requestId} baigta (kariai: ${result.troopsSent}/${troopsNeeded}).`,
      components: [],
    });
    return;
  }

  // Update the ephemeral message
  const totalRequests = getAllRequests(guildId).length;
  const content = await buildStackInfoContent(guildId, requestId);

  if (!content) {
    await interaction.editReply({
      content: "Užklausa nerasta.",
      components: [],
    });
    return;
  }

  await interaction.editReply({
    content: content + "\n\n*Atnaujinta*",
    components: [buildStackEditButtons(requestId, totalRequests)],
  });
}

export async function handleStackDeleteButton(
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

  const requestId = parseRequestId(interaction.customId);
  if (!requestId) {
    await interaction.reply({
      content: "Klaida: neteisingas užklausos ID.",
      ephemeral: true,
    });
    return;
  }

  const request = getRequestById(guildId, requestId);
  if (!request) {
    await interaction.reply({
      content: `Užklausa #${requestId} nerasta.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  // Show confirmation buttons
  const content = await buildStackInfoContent(guildId, requestId);

  await interaction.editReply({
    content: content + "\n\n**Ar tikrai nori ištrinti?**",
    components: [buildConfirmDeleteButtons(requestId)],
  });
}

export async function handleStackConfirmDelete(
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

  const requestId = parseRequestId(interaction.customId);
  if (!requestId) {
    await interaction.reply({
      content: "Klaida: neteisingas užklausos ID.",
      ephemeral: true,
    });
    return;
  }

  const request = getRequestById(guildId, requestId);
  if (!request) {
    await interaction.reply({
      content: `Užklausa #${requestId} jau ištrinta.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  // Snapshot for undo
  const snapshot = { ...request, contributors: [...request.contributors] };

  // Delete the request
  const success = removeRequest(guildId, requestId);
  if (!success) {
    await interaction.followUp({
      content: "Nepavyko ištrinti užklausos.",
      ephemeral: true,
    });
    return;
  }

  // Record action for undo
  const actionId = recordAction(guildId, {
    type: "REQUEST_DELETED",
    userId: interaction.user.id,
    coords: { x: request.x, y: request.y },
    requestId,
    previousState: snapshot,
    data: {},
  });

  // Update global defense message
  await updateGlobalMessage(interaction.client, guildId);

  // Update the ephemeral message
  const config = getGuildConfig(guildId);
  const village = config.serverKey
    ? await getVillageAt(config.serverKey, request.x, request.y)
    : null;
  const villageDisplay = village && config.serverKey
    ? formatVillageDisplay(config.serverKey, village)
    : `(${request.x}|${request.y})`;

  await interaction.editReply({
    content: `Ištrinta: ${villageDisplay}\n\nAtšaukti: \`/undo ${actionId}\``,
    components: [],
  });
}

export async function handleStackCancelDelete(
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

  const requestId = parseRequestId(interaction.customId);
  if (!requestId) {
    await interaction.reply({
      content: "Klaida: neteisingas užklausos ID.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const request = getRequestById(guildId, requestId);
  if (!request) {
    await interaction.editReply({
      content: `Užklausa #${requestId} nerasta.`,
      components: [],
    });
    return;
  }

  // Restore original view
  const totalRequests = getAllRequests(guildId).length;
  const content = await buildStackInfoContent(guildId, requestId);

  if (!content) {
    await interaction.editReply({
      content: "Užklausa nerasta.",
      components: [],
    });
    return;
  }

  await interaction.editReply({
    content,
    components: [buildStackEditButtons(requestId, totalRequests)],
  });
}
