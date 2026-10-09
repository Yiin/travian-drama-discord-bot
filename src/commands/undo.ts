import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { executeUndoAction } from "../actions";
import { withRetry } from "../utils/retry";
import { errors, confirmationEdit, asConfirm, failEdit, failReply } from "../actions/messages";
import { getLatestUndoableActionId } from "../services/action-history";
import { getStackPanelUrl } from "../services/defense-message";
import { guildCommand, requireGuild } from "./shared";
import { buildActionContext } from "../actions/context";

export const undoCommand: Command = {
  topic: "info",
  summary: "Undo your last action, or a specific one by id",
  data: guildCommand("undo", "Undo an action (your most recent one if no id is given)")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("Action id from a confirmation or the channel log (default: your most recent)")
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply(failReply(errors.notSetUp(), interaction));
      return;
    }

    const actionId = interaction.options.getInteger("id") ?? getLatestUndoableActionId(guildId, interaction.user.id);
    if (!actionId) {
      await interaction.reply({ content: errors.nothingToUndo(), flags: MessageFlags.Ephemeral });
      return;
    }

    await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

    const result = await executeUndoAction(
      buildActionContext(interaction, guildId, config),
      { actionId }
    );

    if (!result.success) {
      await interaction.editReply(failEdit(result.error, interaction));
      return;
    }

    await interaction.editReply(
      confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
        panelUrl: getStackPanelUrl(guildId),
      })
    );
  },
};
