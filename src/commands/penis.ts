import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../types";

export const penisCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("penis")
    .setDescription("Generate a random penis size"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const random = Math.random() * 30;

    let size: number;
    if (random < 1) {
      // 0.1 to 1.0 with 0.1 accuracy
      size = Math.max(0.1, Math.round(random * 10) / 10);
    } else {
      // 1 to 30, rounded to whole numbers
      size = Math.round(random);
    }

    const sizeStr = size < 1 ? size.toFixed(1) : size.toString();
    const prefix = `${interaction.user.displayName} penio dydis:`;

    const comments: Record<string, string[]> = {
      tiny: [
        "Bent jau charakteris didelis... tikriausiai.",
        "Svarbu ne dydis, o... ne, iš tikrųjų svarbu dydis.",
        "Na, bent šildymas pigiau kainuos.",
        "Mikroskopas pridedamas nemokamai.",
        "F",
      ],
      small: [
        "Vidutiniškai... žemiau vidurkio.",
        "Kompensuoji su BMW.",
        "Kompaktiška versija.",
        "Ekonominė klasė.",
      ],
      medium: [
        "Nieko ypatingo, bet ir nesiskundžiam.",
        "Standartinė komplektacija.",
        "Pakankama.",
        "Almost above avarage.",
      ],
      large: [
        "Jaučiu vengi aptemptų kelnių?",
        "👀...",
        "Pagarba.",
        "Premium paketas.",
      ],
      huge: [
        "Svorio centras žemesnis negu įprasta.",
        "Užuojauta antrai pusei.",
        "Reikės leidimo nešiotis.",
        "Trečia koja?",
        "Nesu tikras kad tai legalu.",
      ],
    };

    let sizeFormatted: string;
    let comment: string;
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    if (size < 5) {
      sizeFormatted = `-# **${sizeStr}cm**`;
      comment = pick(comments.tiny);
    } else if (size < 10) {
      sizeFormatted = `**${sizeStr}cm**`;
      comment = pick(comments.small);
    } else if (size < 15) {
      sizeFormatted = `**${sizeStr}cm**`;
      comment = pick(comments.medium);
    } else if (size < 25) {
      sizeFormatted = `## **${sizeStr}cm**`;
      comment = pick(comments.large);
    } else {
      sizeFormatted = `# **${sizeStr}cm**`;
      comment = pick(comments.huge);
    }

    await interaction.reply(`${prefix}\n${sizeFormatted}\n-# ${comment}`);
  },
};
