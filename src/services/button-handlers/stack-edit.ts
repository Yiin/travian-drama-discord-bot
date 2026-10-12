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
import { getScopeConfig } from "../../config/guild-config";
import { getRequestById, getAllRequests, getRequestPosition } from "../defense-requests";
import { getVillageAt, formatVillageDisplay } from "../map-data";
import { formatTroops } from "../../utils/format";
import { errors, confirmationEdit, failReply, asConfirm } from "../../actions/messages";
import { getStackPanelUrl } from "../defense-message";
import { buildActionContext } from "../../actions/context";
import { checkPermission } from "../../actions/permissions";
import { executeDeleteDefAction, executeMoveAction, executeUpdateDefAction } from "../../actions";
import { stackChoiceLabel } from "../../utils/choices";
import { resolveScope, Scope } from "../../config/scope";

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
  scope: Scope,
  requestId: number
): Promise<{ content: string; components: ActionRowBuilder<ButtonBuilder>[] } | null> {
  const config = getScopeConfig(scope);
  const request = getRequestById(scope, requestId);
  const position = getRequestPosition(scope, requestId);
  const totalRequests = getAllRequests(scope).length;

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

async function scopeOrReply(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
): Promise<Scope | null> {
  const scope = await resolveScope(interaction);
  if (scope) return scope;
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
  const scope = await scopeOrReply(interaction);
  if (!scope) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const position = getRequestPosition(scope, requestId);
  if (!position) {
    await interaction.reply({ content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral });
    return;
  }

  const total = getAllRequests(scope).length;
  const target = position + offset;
  if (target < 1 || target > total) {
    await interaction.reply({
      content: offset < 0 ? "The request is already at the top." : "The request is already at the bottom.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  const context = buildActionContext(interaction, scope, getScopeConfig(scope));
  const result = await executeMoveAction(context, { requestId, toPosition: target });
  if (!result.success) {
    await interaction.followUp(failReply(result.error, interaction));
    return;
  }

  const editor = await buildStackEditor(scope, requestId);
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
  const scope = await scopeOrReply(interaction);
  if (!scope) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const request = getRequestById(scope, requestId);
  if (!request) {
    await interaction.reply({ content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral });
    return;
  }
  const context = buildActionContext(interaction, scope, getScopeConfig(scope));
  const denied = checkPermission(context, "manage", request.requesterId);
  if (denied) {
    await interaction.reply({ content: denied, flags: MessageFlags.Ephemeral });
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
  const scope = await scopeOrReply(interaction);
  if (!scope) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const request = getRequestById(scope, requestId);
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

  const context = buildActionContext(interaction, scope, getScopeConfig(scope));
  const result = await executeUpdateDefAction(context, { requestId, troopsNeeded, message });
  if (!result.success) {
    await interaction.followUp(failReply(result.error, interaction));
    return;
  }

  const editor = await buildStackEditor(scope, requestId);
  if (!editor) {
    await interaction.editReply({
      content: `✅ Request #${requestId} is complete (${formatTroops(result.request.troopsSent)} / ${formatTroops(troopsNeeded)}).`,
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
  const scope = await scopeOrReply(interaction);
  if (!scope) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  const editor = await buildStackEditor(scope, requestId);
  const request = getRequestById(scope, requestId);
  if (!editor || !request) {
    await interaction.reply({ content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral });
    return;
  }
  const denied = checkPermission(buildActionContext(interaction, scope, getScopeConfig(scope)), "manage", request.requesterId);
  if (denied) {
    await interaction.reply({ content: denied, flags: MessageFlags.Ephemeral });
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
  const scope = await scopeOrReply(interaction);
  if (!scope) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  await interaction.deferUpdate();

  const context = buildActionContext(interaction, scope, getScopeConfig(scope));
  const result = await executeDeleteDefAction(context, { requestId });
  if (!result.success) {
    await interaction.followUp(failReply(result.error, interaction));
    return;
  }

  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
      actionId: result.actionId,
      panelUrl: getStackPanelUrl(scope),
    })
  );
}

export async function handleStackCancelDelete(
  interaction: ButtonInteraction
): Promise<void> {
  const scope = await scopeOrReply(interaction);
  if (!scope) return;
  const requestId = await requestIdOrReply(interaction);
  if (!requestId) return;

  await interaction.deferUpdate();

  const editor = await buildStackEditor(scope, requestId);
  await interaction.editReply(editor ?? { content: errors.notFound("request", requestId), components: [] });
}

// --- Panel "Edit" button: pick a request, then edit it ---

export const STACK_PANEL_EDIT_BUTTON_ID = "stack_panel_edit";
export const STACK_PICK_SELECT_ID = "stack_pick_edit";

/** Panel Edit button: one request opens the editor; several show a picker first. */
export async function handleStackPanelEditButton(interaction: ButtonInteraction): Promise<void> {
  const scope = await scopeOrReply(interaction);
  if (!scope) return;

  const requests = getAllRequests(scope);
  if (requests.length === 0) {
    await interaction.reply({
      content: "⚠️ **There are no open stack requests.** Press **Request stack** to add one.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (requests.length === 1) {
    const editor = await buildStackEditor(scope, requests[0].id);
    await interaction.reply({ ...(editor ?? { content: errors.generic(), components: [] }), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    content: "Pick the request to edit:",
    components: [await buildStackPicker(scope)],
    flags: MessageFlags.Ephemeral,
  });
}

async function buildStackPicker(scope: Scope): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
  const config = getScopeConfig(scope);
  const options: StringSelectMenuOptionBuilder[] = [];
  const requests = getAllRequests(scope).slice(0, 25);
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
  const scope = await scopeOrReply(interaction);
  if (!scope) return;
  const requestId = parseInt(interaction.values[0] ?? "", 10);
  const editor = Number.isFinite(requestId) ? await buildStackEditor(scope, requestId) : null;
  await interaction.update(editor ?? { content: errors.notFound("request", requestId), components: [] });
}
