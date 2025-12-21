import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { validateDefenseConfig, executeSentAction } from "../actions";
import { withRetry } from "../utils/retry";

function buildSentCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Report troops sent to a defense request")
    .addStringOption((option) =>
      option
        .setName("target")
        .setDescription("Request ID or coordinates (e.g., 1 or 123|456)")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Number of troops sent")
        .setRequired(true)
        .setMinValue(1)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to credit for sending troops (defaults to you)")
        .setRequired(false)
    );
}

async function executeSent(interaction: ChatInputCommandInteraction): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Parse inputs
  const targetInput = interaction.options.getString("target", true);
  const troops = interaction.options.getInteger("troops", true);
  const targetUser = interaction.options.getUser("user") || interaction.user;

  // 3. Defer reply
  await withRetry(() => interaction.deferReply());

  // 4. Execute action
  const result = await executeSentAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      target: targetInput,
      troops,
      creditUserId: targetUser.id,
    }
  );

  // 5. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  // Success: delete reply (info is in global message)
  await interaction.deleteReply();
}

export const sentCommand: Command = {
  data: buildSentCommand("sent"),
  execute: executeSent,
};

export const stackCommand: Command = {
  data: buildSentCommand("stack"),
  execute: executeSent,
};
