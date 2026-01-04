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
        "Paslėptas talentas. Labai paslėptas.",
        "Svarbu ne dydis, o... ne, iš tikrųjų svarbu dydis.",
        "Na, bent šildymas pigiau kainuos.",
        "Mikroskopas pridedamas nemokamai.",
        "Statistiškai egzistuoja.",
        "Jei mirktelėsi - praleisi.",
        "Labiau idėja nei objektas.",
        "Simbolinis.",
        "Pagarba už pastangas, ne už rezultatą.",
      ],
      small: [
        "Vidutiniškai... žemiau vidurkio.",
        "Kompensuoji su BMW.",
        "Kompaktiška versija.",
        "Ekonominė klasė.",
        "Nedidelis, bet su charakteriu.",
        "Diskretiškas.",
        "Žiūrint iš kokio kampo..."
      ],
      medium: [
        "Nieko ypatingo, bet ir nesiskundžiam.",
        "Standartinė komplektacija.",
        "Pakankama.",
        "Beveik virš normos.",
        "Vokiškas standartas."
      ],
      large: [
        "Sunku nuslėpti.",
        "Rekomenduojama įspėti iš anksto.",
        "Pagarba.",
        "Premium paketas.",
        "Išliekantis atmintyje.",
        "Užtrikrintas dėmesys."
      ],
      huge: [
        "Ryanair sveria atskirai.",
        "Svorio centras žemiau negu įprasta.",
        "Reikės leidimo nešiotis.",
        "Reikia dviejų rankų.",
        "Neaišku ar tai legalu.",
        "Į kambarį užeina pirmas."
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
