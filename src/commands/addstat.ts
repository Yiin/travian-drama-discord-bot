import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { recordContribution } from "../services/stats";

export const addstatCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("addstat")
    .setDescription("Add/subtract sent troops to/from stats (without a defense request)")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Village coordinates (for example, 123|456 or -45|89)")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Troop count (negative number = subtract)")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to assign stats to (default: you)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const coordsInput = interaction.options.getString("coords", true);
    const troops = interaction.options.getInteger("troops", true);
    const targetUser = interaction.options.getUser("user");

    const coords = parseCoords(coordsInput);
    if (!coords) {
      await interaction.reply({
        content: "Invalid coordinates. Use `123|456` or `-45|89`.",
        ephemeral: true,
      });
      return;
    }

    if (troops === 0) {
      await interaction.reply({
        content: "Troop count cannot be 0.",
        ephemeral: true,
      });
      return;
    }

    // Record the contribution for the specified user or the interaction user
    const targetUserId = targetUser?.id || interaction.user.id;
    recordContribution(guildId, targetUserId, coords.x, coords.y, troops);

    const userMention = targetUser ? ` (<@${targetUser.id}>)` : "";
    const action = troops > 0 ? "Added" : "Subtracted";

    await interaction.reply({
      content: `${action}: **${Math.abs(troops).toLocaleString()}** troops ${troops > 0 ? "to" : "from"} (${coords.x}|${coords.y}) stats${userMention}.`,
      ephemeral: true,
    });
  },
};
