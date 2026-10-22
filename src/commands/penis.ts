import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "../types";
import { guildCommand } from "./shared";

export const penisCommand: Command = {
  data: guildCommand("penis", "Generate a random penis size"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = `${interaction.user.displayName}'s penis size:`;
    const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    // 1 in 10 rolls skips the ruler entirely
    const anomalies: { size: string; comment: string }[] = [
      { size: "**0cm**", comment: "Grows with your alliance's WW level." },
      { size: "**π cm**", comment: "Irrational, but it never ends." },
      { size: "**6cm** (+18cm hero bonus)", comment: "Bonus expires in 3 days." },
      { size: "**Yes**", comment: "The ruler would not elaborate." },
    ];
    if (Math.random() < 0.1) {
      const anomaly = pick(anomalies);
      await interaction.reply(`${prefix}\n${anomaly.size}\n-# ${anomaly.comment}`);
      return;
    }

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
