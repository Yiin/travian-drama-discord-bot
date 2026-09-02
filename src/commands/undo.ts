import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { executeUndoAction } from "../actions";
import { withRetry } from "../utils/retry";
import { errors } from "../actions/messages";
import { getLatestUndoableActionId } from "../services/action-history";
import { getStackPanelUrl } from "../services/defense-message";
import { confirmationEdit, asConfirm, channelUrl } from "../actions/messages";

export const undoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("undo")
    .setDescription("Undo an action (the most recent one if no ID is given)")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("Action ID from the confirmation or the channel log (default: most recent)")
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;

    // 1. Basic validation (undo only needs defenseChannelId)
    if (!guildId) {
      await interaction.reply({
        content: errors.guildOnly(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.defenseChannelId && !config.pushChannelId) {
      await interaction.reply({
        content: errors.notSetUp(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 2. Parse inputs
    const actionId = interaction.options.getInteger("id") ?? getLatestUndoableActionId(guildId);
    if (!actionId) {
      await interaction.reply({ content: errors.notFound("undoable action"), flags: MessageFlags.Ephemeral });
      return;
    }

    // 3. Defer reply
    await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

    // 4. Execute action
    const result = await executeUndoAction(
      {
        guildId,
        config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      { actionId }
    );

    // 5. Handle response
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
