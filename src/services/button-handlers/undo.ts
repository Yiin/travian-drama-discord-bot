import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { executeUndoAction } from "../../actions/undo.action";
import { errors, UNDO_BUTTON_PREFIX, failReply } from "../../actions/messages";
import { buildActionContext } from "../../actions/context";

export { UNDO_BUTTON_PREFIX };

/**
 * "Undo" button on an ephemeral confirmation. Your own action, or anyone's with `manage`.
 * On success the confirmation is rewritten to "↩️ Undone." with the button disabled.
 */
export async function handleUndoButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
    return;
  }

  const actionId = parseInt(interaction.customId.slice(UNDO_BUTTON_PREFIX.length), 10);
  if (isNaN(actionId) || actionId < 1) {
    await interaction.reply({ content: errors.notFound("action"), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const result = await executeUndoAction(
    buildActionContext(interaction, guildId, getGuildConfig(guildId)),
    { actionId }
  );

  if (!result.success) {
    await interaction.followUp(failReply(result.error, interaction));
    return;
  }

  const disabled = new ButtonBuilder()
    .setCustomId(`${UNDO_BUTTON_PREFIX}${actionId}`)
    .setLabel("Undone")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  await interaction.editReply({
    content: `↩️ Undone: ${result.description}.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(disabled)],
  });
}
