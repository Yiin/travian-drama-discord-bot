import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  MessageFlags,
  UserSelectMenuBuilder,
  GuildMember,
} from "discord.js";
import { isAdmin } from "../../utils/permissions";
import { GuildConfig } from "../../config/guild-config";
import { getPushRequestByChannelId, PushRequest } from "../push-requests";
import {
  validatePushConfig,
  validateUserHasAccount,
  executePushSentAction,
  executePushCloseAction,
  executePushEditAction,
} from "../../actions";
import { formatResources } from "../../utils/format";
import { errors, confirmationEdit, asConfirm, failReply, failEdit } from "../../actions/messages";

export {
  PUSH_SENT_BUTTON_ID,
  PUSH_EDIT_BUTTON_ID,
  PUSH_CLOSE_BUTTON_ID,
  PUSH_ALL_SENDERS_BUTTON_ID,
} from "../push-message";

export const PUSH_SENT_MODAL_ID = "push_sent_modal";
export const PUSH_EDIT_MODAL_ID = "push_edit_modal";
export const PUSH_RESOURCES_INPUT_ID = "push_resources_input";
export const PUSH_AMOUNT_INPUT_ID = "push_amount_input";
export const PUSH_SENT_FOR_SELECT_ID = "push_sent_for_select";

type Ctx = { guildId: string; config: GuildConfig; request: PushRequest; requestId: number };

/** Shared pre-flight for every push button and modal: setup, thread, open request. */
async function pushContext(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  options: { allowClosed?: boolean } = {}
): Promise<Ctx | null> {
  const validation = validatePushConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply(failReply(validation.error, interaction));
    return null;
  }
  const channelId = interaction.channelId;
  const info = channelId ? getPushRequestByChannelId(validation.guildId, channelId) : undefined;
  if (!info) {
    await interaction.reply({ content: errors.notInThread("push"), flags: MessageFlags.Ephemeral });
    return null;
  }
  if (info.request.closed && !options.allowClosed) {
    await interaction.reply({
      content: "⚠️ **This push request is closed.** Undo the close first if it was a mistake.",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return { guildId: validation.guildId, config: validation.config, request: info.request, requestId: info.requestId };
}

function parseAmount(raw: string): number | null {
  const value = parseInt(raw.replace(/[,.\s]/g, ""), 10);
  return isNaN(value) || value < 1 ? null : value;
}

export async function handlePushSentButton(interaction: ButtonInteraction): Promise<void> {
  const ctx = await pushContext(interaction);
  if (!ctx) return;

  const accountResult = validateUserHasAccount(ctx.guildId, interaction.user.id);
  if (!accountResult.valid) {
    await interaction.reply(failReply(accountResult.error, interaction));
    return;
  }

  const modal = new ModalBuilder().setCustomId(PUSH_SENT_MODAL_ID).setTitle("Report sent resources");

  const resourcesInput = new TextInputBuilder()
    .setCustomId(PUSH_RESOURCES_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("50000")
    .setRequired(true)
    .setMaxLength(15);
  const resourcesLabel = new LabelBuilder()
    .setLabel("Resources sent")
    .setDescription(`Whole number. Current: ${formatResources(ctx.request.resourcesSent)} / ${formatResources(ctx.request.resourcesNeeded)}`)
    .setTextInputComponent(resourcesInput);

  const forSelect = new UserSelectMenuBuilder()
    .setCustomId(PUSH_SENT_FOR_SELECT_ID)
    .setPlaceholder("Pick a member…")
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false);
  const forLabel = new LabelBuilder()
    .setLabel("Sent by")
    .setDescription("Leave empty if you sent them yourself")
    .setUserSelectMenuComponent(forSelect);

  modal.addLabelComponents(resourcesLabel, forLabel);
  await interaction.showModal(modal);
}

export async function handlePushSentModal(interaction: ModalSubmitInteraction): Promise<void> {
  const ctx = await pushContext(interaction);
  if (!ctx) return;

  const resources = parseAmount(interaction.fields.getTextInputValue(PUSH_RESOURCES_INPUT_ID));
  if (resources === null) {
    await interaction.reply({ content: errors.invalidCount("resources"), flags: MessageFlags.Ephemeral });
    return;
  }
  const sentBy = interaction.fields.getSelectedUsers(PUSH_SENT_FOR_SELECT_ID, false)?.first();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await executePushSentAction(
    { guildId: ctx.guildId, config: ctx.config, client: interaction.client, userId: interaction.user.id },
    { target: ctx.requestId.toString(), resources, creditUserId: sentBy?.id }
  );

  if (!result.success) {
    await interaction.editReply(failEdit(result.error, interaction));
    return;
  }
  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}

export async function handlePushEditButton(interaction: ButtonInteraction): Promise<void> {
  const ctx = await pushContext(interaction);
  if (!ctx) return;

  const modal = new ModalBuilder().setCustomId(PUSH_EDIT_MODAL_ID).setTitle("Edit push amount");
  const amountInput = new TextInputBuilder()
    .setCustomId(PUSH_AMOUNT_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setValue(String(ctx.request.resourcesNeeded))
    .setRequired(true)
    .setMaxLength(15);
  const amountLabel = new LabelBuilder()
    .setLabel("Resources needed")
    .setDescription(`Total for the whole push. ${formatResources(ctx.request.resourcesSent)} already sent`)
    .setTextInputComponent(amountInput);
  modal.addLabelComponents(amountLabel);
  await interaction.showModal(modal);
}

export async function handlePushEditModal(interaction: ModalSubmitInteraction): Promise<void> {
  const ctx = await pushContext(interaction);
  if (!ctx) return;

  const resourcesNeeded = parseAmount(interaction.fields.getTextInputValue(PUSH_AMOUNT_INPUT_ID));
  if (resourcesNeeded === null) {
    await interaction.reply({ content: errors.invalidCount("resources"), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await executePushEditAction(
    { guildId: ctx.guildId, config: ctx.config, client: interaction.client, userId: interaction.user.id },
    { requestId: ctx.requestId, resourcesNeeded }
  );
  if (!result.success) {
    await interaction.editReply(failEdit(result.error, interaction));
    return;
  }
  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
  );
}

export async function handlePushCloseButton(interaction: ButtonInteraction): Promise<void> {
  const ctx = await pushContext(interaction);
  if (!ctx) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await executePushCloseAction(
    { guildId: ctx.guildId, config: ctx.config, client: interaction.client, userId: interaction.user.id },
    { requestId: ctx.requestId },
    {
      isAdmin: isAdmin(interaction.member as GuildMember | null),
      onClosed: async (closed) => {
        await interaction.editReply(
          confirmationEdit(closed.confirmText ?? asConfirm(closed.actionText), { actionId: closed.actionId })
        );
      },
    }
  );
  if (!result.success) {
    await interaction.editReply(failEdit(result.error, interaction));
  }
}

/** Ephemeral full list of senders when the card only shows the top few. */
export async function handlePushAllSendersButton(interaction: ButtonInteraction): Promise<void> {
  const ctx = await pushContext(interaction, { allowClosed: true });
  if (!ctx) return;
  const sorted = [...ctx.request.contributors].sort((a, b) => b.resources - a.resources);
  const lines = sorted.map((c, i) => `${i + 1}. **${c.accountName}** · ${formatResources(c.resources)}`);
  await interaction.reply({
    content: lines.length ? `**Senders for #${ctx.requestId}**\n${lines.join("\n")}` : "Nobody has sent resources yet.",
    flags: MessageFlags.Ephemeral,
  });
}
