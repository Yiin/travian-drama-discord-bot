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
    .setDescription("Pridėti/atimti karių siuntimą į/iš statistikos (be gynybos prašymo)")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Kaimo koordinatės (pvz., 123|456 arba -45|89)")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Karių skaičius (neigiamas skaičius = atimti)")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Vartotojas, kuriam priskirti statistiką (numatyta: tu)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "Ši komanda veikia tik serveryje.",
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
        content: "Neteisingos koordinatės. Naudok formatą `123|456` arba `-45|89`.",
        ephemeral: true,
      });
      return;
    }

    if (troops === 0) {
      await interaction.reply({
        content: "Karių skaičius negali būti 0.",
        ephemeral: true,
      });
      return;
    }

    // Record the contribution for the specified user or the interaction user
    const targetUserId = targetUser?.id || interaction.user.id;
    recordContribution(guildId, targetUserId, coords.x, coords.y, troops);

    const userMention = targetUser ? ` (<@${targetUser.id}>)` : "";
    const action = troops > 0 ? "Pridėta" : "Atimta";

    await interaction.reply({
      content: `${action}: **${Math.abs(troops).toLocaleString()}** karių ${troops > 0 ? "į" : "iš"} (${coords.x}|${coords.y}) statistikos${userMention}.`,
      ephemeral: true,
    });
  },
};
