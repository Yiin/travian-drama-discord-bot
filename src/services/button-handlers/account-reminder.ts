import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
} from "discord.js";
import {
  getAccountForUser,
  isNotPlaying,
  markNotPlaying,
  setAccount,
} from "../player-accounts";

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
      content: "Ši komanda veikia tik serveryje.",
      ephemeral: true,
    });
    return;
  }

  const existing = getAccountForUser(guildId, interaction.user.id);

  const modal = new ModalBuilder()
    .setCustomId(ACCOUNT_REMINDER_MODAL_ID)
    .setTitle("Pridėti žaidimo paskyrą");

  const nameInput = new TextInputBuilder()
    .setCustomId(ACCOUNT_REMINDER_NAME_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Žaidėjo vardas")
    .setRequired(true)
    .setMaxLength(50);

  if (existing) {
    nameInput.setValue(existing);
  }

  const nameLabel = new LabelBuilder()
    .setLabel("Žaidimo paskyros vardas")
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
      content: "Ši komanda veikia tik serveryje.",
      ephemeral: true,
    });
    return;
  }

  const inGameName = interaction.fields
    .getTextInputValue(ACCOUNT_REMINDER_NAME_INPUT_ID)
    .trim();

  if (!inGameName) {
    await interaction.reply({
      content: "Įvesk teisingą žaidėjo vardą.",
      ephemeral: true,
    });
    return;
  }

  const previous = getAccountForUser(guildId, interaction.user.id);
  setAccount(guildId, interaction.user.id, inGameName);

  const message =
    previous && previous !== inGameName
      ? `Atnaujinta paskyra: **${previous}** → **${inGameName}**.`
      : previous === inGameName
        ? `Tu jau esi susietas su **${inGameName}**.`
        : `Esi susietas su žaidimo paskyra **${inGameName}**.`;

  await interaction.reply({ content: message, ephemeral: true });
}

export async function handleAccountReminderSkipButton(
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

  if (isNotPlaying(guildId, interaction.user.id)) {
    await interaction.reply({
      content:
        "Jau esi pažymėtas kaip nežaidžiantis. Jei žaidi — paspausk **Pridėti** arba naudok `/account set`.",
      ephemeral: true,
    });
    return;
  }

  markNotPlaying(guildId, interaction.user.id);

  await interaction.reply({
    content:
      "Pažymėta, kad nežaidi. Jei apsigalvosi — paspausk **Pridėti** arba naudok `/account set`.",
    ephemeral: true,
  });
}
