import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { executeUndoAction } from "../actions";
import { withRetry } from "../utils/retry";
import { errors, confirmationEdit, asConfirm } from "../actions/messages";
import { getLatestUndoableActionId } from "../services/action-history";
import { getStackPanelUrl } from "../services/defense-message";
import { guildCommand, requireGuild } from "./shared";

export const undoCommand: Command = {
  topic: "info",
  summary: "Undo the last action, or a specific one by id",
  data: guildCommand("undo", "Undo an action (the most recent one if no id is given)")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("Action id from a confirmation or the channel log (default: most recent)")
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({ content: errors.notSetUp(), flags: MessageFlags.Ephemeral });
      return;
    }

    const actionId = interaction.options.getInteger("id") ?? getLatestUndoableActionId(guildId);
    if (!actionId) {
      await interaction.reply({ content: errors.notFound("undoable action"), flags: MessageFlags.Ephemeral });
      return;
    }

    await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

    const result = await executeUndoAction(
      { guildId, config, client: interaction.client, userId: interaction.user.id },
      { actionId }
    );

    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply(
      confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
        panelUrl: getStackPanelUrl(guildId),
      })
    );
  },
};
