import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { requireAdmin } from "../../utils/permissions";
import { getPushRequestByChannelId, removePushRequest } from "../push-requests";
import {
  validatePushConfig,
  validateUserHasAccount,
  executePushSentAction,
} from "../../actions";
import { deletePushChannel } from "../push-message";

// Button IDs (defined in push-message.ts)
export { PUSH_SENT_BUTTON_ID, PUSH_DELETE_BUTTON_ID } from "../push-message";

// Push modal IDs
export const PUSH_SENT_MODAL_ID = "push_sent_modal";
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

  // Get the push request for this channel
  const channelId = interaction.channelId;
  const requestInfo = getPushRequestByChannelId(guildId, channelId);
  if (!requestInfo) {
    await interaction.reply({
      content: "Šiame kanale nerasta aktyvi push užklausa.",
      ephemeral: true,
    });
    return;
  }

  // Build simplified modal with just resources input
  const modal = new ModalBuilder()
    .setCustomId(PUSH_SENT_MODAL_ID)
    .setTitle("Išsiunčiau resursus");

  const resourcesInput = new TextInputBuilder()
    .setCustomId(PUSH_RESOURCES_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("50000")
    .setRequired(true)
    .setMaxLength(15);

  const resourcesLabel = new LabelBuilder()
    .setLabel("Kiek resursų išsiunčiau?")
    .setDescription(`Tikslas: ${formatNumber(requestInfo.request.resourcesNeeded)}`)
    .setTextInputComponent(resourcesInput);

  modal.addLabelComponents(resourcesLabel);

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

  // 2. Get the push request for this channel
  const channelId = interaction.channelId;
  if (!channelId) {
    await interaction.reply({
      content: "Nepavyko nustatyti kanalo.",
      ephemeral: true,
    });
    return;
  }

  const requestInfo = getPushRequestByChannelId(validation.guildId, channelId);
  if (!requestInfo) {
    await interaction.reply({
      content: "Šiame kanale nerasta aktyvi push užklausa.",
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

  // 5. Execute action using the request ID from channel lookup
  const result = await executePushSentAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      target: requestInfo.requestId.toString(),
      resources,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  // Success: delete the reply (info is shown in the channel)
  await interaction.deleteReply();
}

export async function handlePushDeleteButton(
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

  // Check if user has admin permissions
  if (!await requireAdmin(interaction)) return;

  // Get the push request for this channel
  const channelId = interaction.channelId;
  const requestInfo = getPushRequestByChannelId(guildId, channelId);
  if (!requestInfo) {
    await interaction.reply({
      content: "Šiame kanale nerasta aktyvi push užklausa.",
      ephemeral: true,
    });
    return;
  }

  // Defer reply before deleting
  await interaction.deferReply({ ephemeral: true });

  try {
    // Delete the channel
    await deletePushChannel(interaction.client, requestInfo.request);

    // Remove from data
    removePushRequest(guildId, requestInfo.requestId);

    // Note: the reply will be lost when channel is deleted, that's OK
  } catch (error) {
    console.error("[PushButton] Error deleting push channel:", error);
    try {
      await interaction.editReply({
        content: "Nepavyko ištrinti kanalo.",
      });
    } catch {
      // Channel might already be deleted, ignore
    }
  }
}
