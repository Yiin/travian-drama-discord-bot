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
    const prefix = `${interaction.user.displayName}'s penis size:`;

    const comments: Record<string, string[]> = {
      tiny: [
        "Hidden talent. Very hidden.",
        "It is not about size... actually, it is about size.",
        "Well, at least heating will be cheaper.",
        "Microscope included for free.",
        "Statistically exists.",
        "Blink and you will miss it.",
        "More of an idea than an object.",
        "Symbolic.",
        "Respect for the effort, not the result.",
      ],
      small: [
        "Average-ish... below average.",
        "Compensating with a BMW.",
        "Compact version.",
        "Economy class.",
        "Small, but with character.",
        "Discreet.",
        "Depends on the angle..."
      ],
      medium: [
        "Nothing special, but no complaints.",
        "Standard package.",
        "Adequate.",
        "Almost above average.",
        "German standard."
      ],
      large: [
        "Hard to hide.",
        "Advance warning recommended.",
        "Respect.",
        "Premium package.",
        "Memorable.",
        "Guaranteed attention."
      ],
      huge: [
        "Ryanair counts it as carry-on luggage.",
        "Center of gravity lower than usual.",
        "A carry permit will be needed.",
        "Requires two hands.",
        "It is unclear whether this is legal.",
        "It enters the room first."
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
