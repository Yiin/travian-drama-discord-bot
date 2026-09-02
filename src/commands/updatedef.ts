import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { Command } from "../types";
import { validateDefenseConfig, executeUpdateDefAction } from "../actions";
import { withRetry } from "../utils/retry";
import { getStackPanelUrl } from "../services/defense-message";
import { confirmationEdit, asConfirm, channelUrl } from "../actions/messages";

export const updatedefCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("updatedef")
    .setDescription("Update a defense request")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("The defense request ID number")
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops_sent")
        .setDescription("Set the troops sent count")
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops_needed")
        .setDescription("Set the troops needed count")
        .setRequired(false)
        .setMinValue(1)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Update the request message")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // 1. Validate configuration
    const validation = validateDefenseConfig(interaction.guildId);
    if (!validation.valid) {
      await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
      return;
    }

    // 2. Parse inputs
    const requestId = interaction.options.getInteger("id", true);
    const troopsSent = interaction.options.getInteger("troops_sent");
    const troopsNeeded = interaction.options.getInteger("troops_needed");
    const message = interaction.options.getString("message");

    // 3. Check if at least one update parameter is provided (before deferring)
    if (troopsSent === null && troopsNeeded === null && message === null) {
      await interaction.reply({
        content: "Provide at least one field to update (troops_sent, troops_needed, or message).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 4. Defer reply
    await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

    // 5. Execute action
    const result = await executeUpdateDefAction(
      {
        guildId: validation.guildId,
        config: validation.config,
        client: interaction.client,
        userId: interaction.user.id,
      },
      {
        requestId,
        troopsSent: troopsSent ?? undefined,
        troopsNeeded: troopsNeeded ?? undefined,
        message: message ?? undefined,
      }
    );

    // 6. Handle response
    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply(
      confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
        actionId: result.actionId,
        panelUrl: getStackPanelUrl(validation.guildId),
      })
    );
  },
};
