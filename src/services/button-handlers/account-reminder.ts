import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  MessageFlags,
} from "discord.js";
import { cmd } from "../../actions/messages";
import {
  getAccountForUser,
  isNotPlaying,
  markNotPlaying,
  setAccount,
} from "../player-accounts";
import { errors } from "../../actions/messages";

export const ACCOUNT_REMINDER_ADD_BUTTON_ID = "account_reminder_add_button";
export const ACCOUNT_REMINDER_SKIP_BUTTON_ID = "account_reminder_skip_button";
export const ACCOUNT_REMINDER_MODAL_ID = "account_reminder_modal";
export const ACCOUNT_REMINDER_NAME_INPUT_ID = "account_reminder_name_input";

export async function handleAccountReminderAddButton(
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

  const existing = getAccountForUser(guildId, interaction.user.id);

  const modal = new ModalBuilder()
    .setCustomId(ACCOUNT_REMINDER_MODAL_ID)
    .setTitle("Add In-Game Account");

  const nameInput = new TextInputBuilder()
    .setCustomId(ACCOUNT_REMINDER_NAME_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Player name")
    .setRequired(true)
    .setMaxLength(50);

  if (existing) {
    nameInput.setValue(existing);
  }

  const nameLabel = new LabelBuilder()
    .setLabel("In-game account name")
    .setTextInputComponent(nameInput);

  modal.addLabelComponents(nameLabel);

  await interaction.showModal(modal);
}

export async function handleAccountReminderModal(
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

  const inGameName = interaction.fields
    .getTextInputValue(ACCOUNT_REMINDER_NAME_INPUT_ID)
    .trim();

  if (!inGameName) {
    await interaction.reply({
      content: "Enter a valid player name.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const previous = getAccountForUser(guildId, interaction.user.id);
  setAccount(guildId, interaction.user.id, inGameName);

  const message =
    previous && previous !== inGameName
      ? `Updated account: **${previous}** → **${inGameName}**.`
      : previous === inGameName
        ? `You are already linked to **${inGameName}**.`
        : `You are linked to in-game account **${inGameName}**.`;

  await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
}

export async function handleAccountReminderSkipButton(
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

  if (isNotPlaying(guildId, interaction.user.id)) {
    await interaction.reply({
      content:
        `You are already marked as not playing. If you are playing, press **Add** or use ${cmd("account link")}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  markNotPlaying(guildId, interaction.user.id);

  await interaction.reply({
    content:
      `✅ Marked as not playing. If you change your mind, press **Add** or use ${cmd("account link")}.`,
    flags: MessageFlags.Ephemeral,
  });
}
