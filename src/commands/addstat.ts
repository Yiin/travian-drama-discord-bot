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
    .setDescription("Pridėti karių siuntimą į statistiką (be gynybos prašymo)")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Kaimo koordinatės (pvz., 123|456 arba -45|89)")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Siųstų karių skaičius")
        .setRequired(true)
        .setMinValue(1)
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

    const coords = parseCoords(coordsInput);
    if (!coords) {
      await interaction.reply({
        content: "Neteisingos koordinatės. Naudok formatą `123|456` arba `-45|89`.",
        ephemeral: true,
      });
      return;
    }

    // Record the contribution
    recordContribution(guildId, interaction.user.id, coords.x, coords.y, troops);

    await interaction.reply({
      content: `Užregistruota: **${troops.toLocaleString()}** karių į (${coords.x}|${coords.y}) statistiką.`,
      ephemeral: true,
    });
  },
};
