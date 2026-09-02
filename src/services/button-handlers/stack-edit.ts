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
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import {
  getRequestById,
  getAllRequests,
  getRequestPosition,
  moveRequest,
  removeRequest,
  updateRequest,
} from "../defense-requests";
import { getVillageAt, formatVillageDisplay } from "../map-data";
import { updateGlobalMessage } from "../defense-message";
import { recordAction } from "../action-history";
import { formatTroops } from "../../utils/format";
import { errors, confirmationEdit } from "../../actions/messages";
import { getStackPanelUrl } from "../defense-message";
import { stackChoiceLabel } from "../../utils/choices";

// Button IDs (prefixes - actual IDs carry the stable request id, like "stack_up:41")
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
  position: number,
  totalRequests: number
): ActionRowBuilder<ButtonBuilder> {
  const upButton = new ButtonBuilder()
    .setCustomId(`${STACK_UP_PREFIX}:${requestId}`)
    .setLabel("Up")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(position <= 1);

  const downButton = new ButtonBuilder()
    .setCustomId(`${STACK_DOWN_PREFIX}:${requestId}`)
    .setLabel("Down")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(position >= totalRequests);

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
    .setLabel("Confirm")
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`${STACK_CANCEL_DELETE_PREFIX}:${requestId}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
    cancelButton
  );
}

/** Ephemeral editor payload for one request: summary text plus Up/Down/Edit/Delete. */
export async function buildStackEditor(
  guildId: string,
  requestId: number
): Promise<{ content: string; components: ActionRowBuilder<ButtonBuilder>[] } | null> {
  const config = getGuildConfig(guildId);
  const request = getRequestById(guildId, requestId);
  const position = getRequestPosition(guildId, requestId);
  const totalRequests = getAllRequests(guildId).length;

  if (!request || !position) {
    return null;
  }

  const village = config.serverKey
    ? await getVillageAt(config.serverKey, request.x, request.y)
    : null;

  const villageDisplay = village && config.serverKey
    ? formatVillageDisplay(config.serverKey, village)
    : `(${request.x}|${request.y})`;

  const progress = request.troopsNeeded > 0
    ? Math.round((request.troopsSent / request.troopsNeeded) * 100)
    : 0;

  const lines = [
    `**#${request.id}** · position ${position} of ${totalRequests} · ${villageDisplay}`,
    `**Player:** ${village?.playerName ?? "Unknown"}`,
    `**Troops:** ${formatTroops(request.troopsSent)} / ${formatTroops(request.troopsNeeded)} (${progress}%)`,
  ];

  if (request.message) {
    lines.push(`**Note:** ${request.message}`);
  }

  return {
    content: lines.join("\n"),
    components: [buildStackEditButtons(request.id, position, totalRequests)],
  };
}

async function guildIdOrReply(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
): Promise<string | null> {
  if (interaction.guildId) return interaction.guildId;
  await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
  return null;
}

async function requestIdOrReply(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<number | null> {
  const requestId = parseRequestId(interaction.customId);
  if (requestId) return requestId;
  await interaction.reply({ content: errors.notFound("request"), flags: MessageFlags.Ephemeral });
  return null;
}

async function moveByOffset(interaction: ButtonInteraction, offset: -1 | 1): Promise<void> {
  const guildId = await guildIdOrReply(interaction);
  if (!guildId) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const position = getRequestPosition(guildId, requestId);
  if (!position) {
    await interaction.reply({ content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral });
    return;
  }

  const total = getAllRequests(guildId).length;
  const target = position + offset;
  if (target < 1 || target > total) {
    await interaction.reply({
      content: offset < 0 ? "The request is already at the top." : "The request is already at the bottom.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  const result = moveRequest(guildId, requestId, target);
  if (!result.success) {
    await interaction.followUp({ content: result.error ?? errors.generic(), flags: MessageFlags.Ephemeral });
    return;
  }

  await updateGlobalMessage(interaction.client, guildId);

  const editor = await buildStackEditor(guildId, requestId);
  await interaction.editReply(editor ?? { content: errors.notFound("request", requestId), components: [] });
}

export async function handleStackUpButton(interaction: ButtonInteraction): Promise<void> {
  await moveByOffset(interaction, -1);
}

export async function handleStackDownButton(interaction: ButtonInteraction): Promise<void> {
  await moveByOffset(interaction, 1);
}

export async function handleStackEditButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = await guildIdOrReply(interaction);
  if (!guildId) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const request = getRequestById(guildId, requestId);
  if (!request) {
    await interaction.reply({ content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`${STACK_EDIT_MODAL_PREFIX}:${requestId}`)
    .setTitle(`Edit request #${requestId}`);

  const troopsInput = new TextInputBuilder()
    .setCustomId(STACK_TROOPS_NEEDED_INPUT_ID)
    .setPlaceholder("1000")
    .setValue(request.troopsNeeded.toString())
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const troopsLabel = new LabelBuilder()
    .setLabel("Troops needed")
    .setDescription(`Currently ${formatTroops(request.troopsSent)} sent`)
    .setTextInputComponent(troopsInput);

  const messageInput = new TextInputBuilder()
    .setCustomId(STACK_MESSAGE_INPUT_ID)
    .setPlaceholder("e.g. anti cav")
    .setValue(request.message || "")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const messageLabel = new LabelBuilder()
    .setLabel("Note (optional)")
    .setTextInputComponent(messageInput);

  modal.addLabelComponents(troopsLabel, messageLabel);

  await interaction.showModal(modal);
}

export async function handleStackEditModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const guildId = await guildIdOrReply(interaction);
  if (!guildId) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const request = getRequestById(guildId, requestId);
  if (!request) {
    await interaction.reply({ content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral });
    return;
  }

  const troopsInput = interaction.fields.getTextInputValue(STACK_TROOPS_NEEDED_INPUT_ID);
  const message = interaction.fields.getTextInputValue(STACK_MESSAGE_INPUT_ID) || "";

  const troopsNeeded = parseInt(troopsInput.replace(/[,.\s]/g, ""), 10);
  if (isNaN(troopsNeeded) || troopsNeeded < 1) {
    await interaction.reply({ content: errors.invalidCount("troops"), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const result = updateRequest(guildId, requestId, { troopsNeeded, message });
  if ("error" in result) {
    await interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    return;
  }

  recordAction(guildId, {
    type: "ADMIN_UPDATE",
    userId: interaction.user.id,
    coords: { x: request.x, y: request.y },
    requestId,
    previousState: { ...request, contributors: [...request.contributors] },
    data: {
      previousTroopsSent: request.troopsSent,
      previousTroopsNeeded: request.troopsNeeded,
      previousMessage: request.message,
      adminDidComplete: result.troopsSent >= result.troopsNeeded,
    },
  });

  await updateGlobalMessage(interaction.client, guildId);

  const editor = await buildStackEditor(guildId, requestId);
  if (!editor) {
    await interaction.editReply({
      content: `✅ Request #${requestId} is complete (${formatTroops(result.troopsSent)} / ${formatTroops(troopsNeeded)}).`,
      components: [],
    });
    return;
  }

  await interaction.editReply({
    content: editor.content + "\n\n✅ Updated.",
    components: editor.components,
  });
}

export async function handleStackDeleteButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = await guildIdOrReply(interaction);
  if (!guildId) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const editor = await buildStackEditor(guildId, requestId);
  if (!editor) {
    await interaction.reply({ content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();
  await interaction.editReply({
    content: editor.content + "\n\n**Delete this request?**",
    components: [buildConfirmDeleteButtons(requestId)],
  });
}

export async function handleStackConfirmDelete(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = await guildIdOrReply(interaction);
  if (!guildId) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const request = getRequestById(guildId, requestId);
  if (!request) {
    await interaction.reply({ content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const snapshot = { ...request, contributors: [...request.contributors] };

  if (!removeRequest(guildId, requestId)) {
    await interaction.followUp({ content: errors.generic(), flags: MessageFlags.Ephemeral });
    return;
  }

  const actionId = recordAction(guildId, {
    type: "REQUEST_DELETED",
    userId: interaction.user.id,
    coords: { x: request.x, y: request.y },
    requestId,
    previousState: snapshot,
    data: {},
  });

  const config = getGuildConfig(guildId);
  const village = config.serverKey
    ? await getVillageAt(config.serverKey, request.x, request.y)
    : null;
  const villageDisplay = village && config.serverKey
    ? formatVillageDisplay(config.serverKey, village)
    : `(${request.x}|${request.y})`;

  await updateGlobalMessage(interaction.client, guildId, {
    text: `<@${interaction.user.id}> deleted request #${requestId}: ${villageDisplay}`,
    undoId: actionId,
  });

  await interaction.editReply(
    confirmationEdit(`✅ Deleted request #${requestId}: ${villageDisplay}.`, {
      actionId,
      panelUrl: getStackPanelUrl(guildId),
    })
  );
}

export async function handleStackCancelDelete(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = await guildIdOrReply(interaction);
  if (!guildId) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  await interaction.deferUpdate();

  const editor = await buildStackEditor(guildId, requestId);
  await interaction.editReply(editor ?? { content: errors.notFound("request", requestId), components: [] });
}

// --- Panel "Edit" button: pick a request, then edit it ---

export const STACK_PANEL_EDIT_BUTTON_ID = "stack_panel_edit";
export const STACK_PICK_SELECT_ID = "stack_pick_edit";

/** Panel Edit button: one request opens the editor; several show a picker first. */
export async function handleStackPanelEditButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = await guildIdOrReply(interaction);
  if (!guildId) return;

  const requests = getAllRequests(guildId);
  if (requests.length === 0) {
    await interaction.reply({
      content: "⚠️ **There are no open stack requests.** Press **Request stack** to add one.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (requests.length === 1) {
    const editor = await buildStackEditor(guildId, requests[0].id);
    await interaction.reply({ ...(editor ?? { content: errors.generic(), components: [] }), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    content: "Pick the request to edit:",
    components: [await buildStackPicker(guildId)],
    flags: MessageFlags.Ephemeral,
  });
}

async function buildStackPicker(guildId: string): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
  const config = getGuildConfig(guildId);
  const options: StringSelectMenuOptionBuilder[] = [];
  const requests = getAllRequests(guildId).slice(0, 25);
  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];
    const village = config.serverKey ? await getVillageAt(config.serverKey, request.x, request.y) : null;
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(stackChoiceLabel(request, village?.villageName, i === 0))
        .setDescription((village?.playerName ?? "unknown village").slice(0, 100))
        .setValue(`${request.id}`),
    );
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(STACK_PICK_SELECT_ID)
    .setPlaceholder("Request to edit")
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export async function handleStackPickSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const guildId = await guildIdOrReply(interaction);
  if (!guildId) return;
  const requestId = parseInt(interaction.values[0] ?? "", 10);
  const editor = Number.isFinite(requestId) ? await buildStackEditor(guildId, requestId) : null;
  await interaction.update(editor ?? { content: errors.notFound("request", requestId), components: [] });
}
